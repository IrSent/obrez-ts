import {
  Conversion,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  AudioSample,
  getEncodableVideoCodecs,
  canEncodeAudio,
  Output,
} from 'mediabunny';
import { usePlayerStore, playerActions } from './store/playerStore';
import type { SoundCensoringEffect } from './types';
import type {
  Input,
  InputAudioTrack,
  AudioBufferSink,
  VideoCodec,
  AudioCodec,
} from 'mediabunny';

/**
 * Decode a bleep sound's dataUrl or url into an AudioBuffer.
 */
async function ensureBleepDecoded(
  soundId: string,
  ctx: OfflineAudioContext,
): Promise<AudioBuffer | null> {
  const sound = usePlayerStore.getState().bleepSounds[soundId];
  if (!sound) return null;
  if (sound.audioBuffer) return sound.audioBuffer;

  if (sound.dataUrl) {
    try {
      const resp = await fetch(sound.dataUrl);
      const arrayBuffer = await resp.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    } catch { /* fall through */ }
  }

  if (sound.url) {
    try {
      const resp = await fetch(sound.url);
      const arrayBuffer = await resp.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    } catch { /* fall through */ }
  }

  return null;
}

function getSoundEffects(): SoundCensoringEffect[] {
  const raw = usePlayerStore.getState().censoringEffects ?? [];
  return raw
    .filter((e: typeof raw[number]): e is SoundCensoringEffect => e.effectType === 'sound')
    .sort((a, b) => a.segmentStart - b.segmentStart);
}

/**
 * Render censored audio using OfflineAudioContext.
 * Each chunk is played sequentially through the gain node.
 * rmsMap maps segmentStart → RMS of that segment (for auto-volume mode).
 */
async function renderCensoredAudio(
  audioChunks: AudioBuffer[],
  sampleRate: number,
  numChannels: number,
  rmsMap: Map<number, number>,
): Promise<AudioBuffer> {
  const totalFrames = audioChunks.reduce((sum, buf) => sum + buf.length, 0);
  const ctx = new OfflineAudioContext(numChannels, totalFrames, sampleRate);

  // Gain node for dampening
  const gainNode = ctx.createGain();
  gainNode.gain.value = 1;
  gainNode.connect(ctx.destination);

  const soundEffects = getSoundEffects();
  const transcriptionResults = usePlayerStore.getState().transcriptionResults;

  // Apply dampening
  for (const effect of soundEffects) {
    if (!effect.dampenOriginal) continue;

    const seg = transcriptionResults?.find(
      ([s]: number) => Math.abs(s - effect.segmentStart) < 0.01,
    );
    if (!seg) continue;

    const [start, end] = seg;
    const dampenedGain = 1 - effect.dampenAmount;

    if (effect.dampenType === 'sharp') {
      gainNode.gain.setValueAtTime(dampenedGain, start);
      gainNode.gain.setValueAtTime(1, end);
    } else {
      const tau = (end - start) * 0.3;
      gainNode.gain.setValueAtTime(dampenedGain, start);
      gainNode.gain.setTargetAtTime(1, start + tau, tau);
      gainNode.gain.setValueAtTime(1, end);
    }
  }

  // Play each chunk sequentially through the gain node
  let cumulativeTime = 0;
  for (const chunk of audioChunks) {
    const source = ctx.createBufferSource();
    source.buffer = chunk;
    source.connect(gainNode);
    source.start(cumulativeTime);
    cumulativeTime += chunk.length / sampleRate;
  }

  // Schedule bleep sounds
  for (const effect of soundEffects) {
    const seg = transcriptionResults?.find(
      ([s]: number) => Math.abs(s - effect.segmentStart) < 0.01,
    );
    if (!seg) continue;

    const bleepBuffer = await ensureBleepDecoded(effect.soundId, ctx);
    if (!bleepBuffer) continue;

    const bleepSource = ctx.createBufferSource();
    bleepSource.buffer = bleepBuffer;
    bleepSource.playbackRate.value = effect.playbackRate;

    const bleepGain = ctx.createGain();
    // Auto mode: scale bleep volume to match the segment's RMS loudness
    // Typical speech RMS is ~0.1–0.4. Normalize: RMS 0.2 → volume 1.0
    const bleepVolume = effect.volumeMode === 'auto'
      ? Math.min(1, (rmsMap.get(effect.segmentStart) ?? 0.2) / 0.2)
      : effect.volume;
    bleepGain.gain.value = bleepVolume ** 2;
    bleepSource.connect(bleepGain);
    bleepGain.connect(ctx.destination);
    bleepSource.start(effect.segmentStart);
  }

  return ctx.startRendering();
}

/**
 * Pick best video codec for the output format.
 */
async function pickVideoCodec(format: 'mp4' | 'webm'): Promise<VideoCodec> {
  const preferred: VideoCodec[] = format === 'mp4' ? ['avc', 'hevc'] : ['vp9', 'vp8'];
  const encodable = await getEncodableVideoCodecs(preferred);
  if (encodable.length > 0) return encodable[0];

  const allEncodable = await getEncodableVideoCodecs(['avc', 'hevc', 'vp9', 'vp8', 'av1']);
  if (format === 'mp4') {
    return (allEncodable.find((c) => c === 'avc' || c === 'hevc') ?? allEncodable[0]) as VideoCodec;
  }
  return (allEncodable.find((c) => c === 'vp9' || c === 'vp8') as VideoCodec) ?? (allEncodable[0] as VideoCodec);
}

/**
 * Pick best audio codec for the output format.
 */
async function pickAudioCodec(format: 'mp4' | 'webm'): Promise<AudioCodec> {
  if (format === 'mp4') {
    if (await canEncodeAudio('aac')) return 'aac';
    if (await canEncodeAudio('mp3')) return 'mp3';
  } else {
    if (await canEncodeAudio('opus')) return 'opus';
    if (await canEncodeAudio('vorbis')) return 'vorbis';
  }
  throw new Error(`No suitable audio codec found for ${format} output`);
}

/**
 * Main export function.
 *
 * Strategy: Use Conversion API with audio process callback.
 * Pre-build censored AudioSamples from the OfflineAudioContext output,
 * then consume them one-by-one in the callback.
 */
export async function exportCensoredVideo(
  input: Input,
  audioTrack: InputAudioTrack,
  audioSink: AudioBufferSink,
  outputFormat: 'mp4' | 'webm',
): Promise<ArrayBuffer> {
  const numChannels = audioTrack.numberOfChannels;
  const sampleRate = audioTrack.sampleRate;

  // --- Phase 1: Collect original audio buffers ---
  const audioBuffers: AudioBuffer[] = [];
  for await (const { buffer } of audioSink.buffers(0)) {
    audioBuffers.push(buffer);
    playerActions.setExportStage(`Collecting audio... (${audioBuffers.length} chunks)`);
  }

  const totalFrames = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);

  // --- Phase 2: Decode bleep sounds ---
  playerActions.setExportStage('Preparing bleep sounds...');

  const decodeCtx = new OfflineAudioContext(1, 1, sampleRate);
  const soundEffects = getSoundEffects();

  for (const effect of soundEffects) {
    const buf = await ensureBleepDecoded(effect.soundId, decodeCtx);
    if (!buf) {
      throw new Error(`Bleep sound "${effect.soundId}" could not be decoded`);
    }
  }
  await decodeCtx.startRendering();

  // --- Phase 3: Compute segment RMS for auto-volume ---
  playerActions.setExportStage('Computing segment RMS...');

  const transcriptionResults = usePlayerStore.getState().transcriptionResults;
  const rmsMap = new Map<number, number>();

  if (transcriptionResults) {
    // Build interleaved per-frame data from chunks for RMS computation
    // We need to compute RMS per segment. Each chunk has numChannels interleaved.
    const frames: Float32Array = new Float32Array(totalFrames);
    let off = 0;
    for (const chunk of audioBuffers) {
      // Use channel 0 for RMS (mono is sufficient)
      const ch0 = chunk.getChannelData(0);
      frames.set(ch0, off);
      off += ch0.length;
    }

    for (const [start, end] of transcriptionResults) {
      const startFrame = Math.floor(start * sampleRate);
      const endFrame = Math.floor(end * sampleRate);
      let sum = 0;
      let count = 0;
      for (let f = startFrame; f < endFrame && f < totalFrames; f++) {
        sum += frames[f] * frames[f];
        count++;
      }
      rmsMap.set(start, count > 0 ? Math.sqrt(sum / count) : 0);
    }
  }

  // --- Phase 3b: Render censored audio ---
  playerActions.setExportStage('Rendering censored audio...');

  const censoredBuffer = await renderCensoredAudio(
    audioBuffers,
    sampleRate,
    numChannels,
    rmsMap,
  );

  // Free original audio buffers
  audioBuffers.length = 0;

  // --- Phase 4: Choose codecs ---
  playerActions.setExportStage('Choosing codecs...');
  const vidCodec = await pickVideoCodec(outputFormat);
  const audCodec = await pickAudioCodec(outputFormat);

  // --- Phase 5: Convert with mediabunny ---
  playerActions.setExportStage('Encoding video...');
  const format = outputFormat === 'mp4'
    ? new Mp4OutputFormat()
    : new WebMOutputFormat();

  const bufferTarget = new BufferTarget();
  const output = new Output({ format, target: bufferTarget });

 // Consume censored audio as a stream of frames.
 // The original and censored audio have the same total frames, but may be
 // split into different chunk sizes by mediabunny. We pull frames from the
 // censored buffer on demand to match each original sample's frame count.
  const censoredChannelData: Float32Array[] = [];
  for (let ch = 0; ch < censoredBuffer.numberOfChannels; ch++) {
    censoredChannelData.push(censoredBuffer.getChannelData(ch));
  }
  let censoredFrameCursor = 0; // current frame position in the censored buffer
  const totalCensoredFrames = censoredBuffer.length;

  const audioProcess = async (_sample: AudioSample) => {
    const framesNeeded = _sample.numberOfFrames;
    const ts = _sample.timestamp;

    // Build a Float32Array with the right number of frames, planar layout
    const data = new Float32Array(numChannels * framesNeeded);

    for (let ch = 0; ch < numChannels; ch++) {
      const dstOffset = ch * framesNeeded;
      const src = censoredChannelData[ch];

      if (censoredFrameCursor < totalCensoredFrames) {
        // We have censored audio — copy it
        const available = totalCensoredFrames - censoredFrameCursor;
        const copyLen = Math.min(available, framesNeeded);
        // planar: source is contiguous, destination stride = numChannels
        for (let i = 0; i < copyLen; i++) {
          data[dstOffset + i] = src[censoredFrameCursor + i];
        }
        censoredFrameCursor += copyLen;
        // If fewer frames available than needed, rest stays zero (silence)
      }
      // else: all censored audio exhausted — data stays zero (silence)
    }

    _sample.close();

    return new AudioSample({
      format: 'f32-planar',
      sampleRate: _sample.sampleRate,
      numberOfFrames: framesNeeded,
      numberOfChannels: _sample.numberOfChannels,
      timestamp: ts,
      data,
    });
  };

  try {
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: { codec: vidCodec },
      audio: {
        codec: audCodec,
        process: audioProcess,
      },
    });

    if (!conversion.isValid) {
      console.warn('Conversion discarded tracks:', conversion.discardedTracks);
    }

    conversion.onProgress = (progress) => {
      const pct = Math.round(progress * 100);
      playerActions.setExportStage(`Encoding... ${pct}%`);
    };

    await conversion.execute();

    // No cleanup needed — we stream directly from censoredBuffer

    const result = bufferTarget.buffer;
    if (!result) {
      throw new Error('Export completed but no output buffer was produced');
    }
    return result;
  } catch (err) {
    await output.cancel();
    throw err;
  }
}
