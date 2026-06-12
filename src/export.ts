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
  const raw = usePlayerStore.getState().censoringEffects;
  return raw
    .filter((e: typeof raw[number]): e is SoundCensoringEffect => e.effectType === 'sound')
    .sort((a, b) => a.segmentStart - b.segmentStart);
}

/**
 * Render censored audio using OfflineAudioContext.
 * Concatenates all chunks into one buffer, applies dampening via gainNode,
 * then schedules bleep sounds — only 2 BufferSource nodes total.
 *
 * rmsMap maps segmentStart → RMS of that segment (for auto-volume mode).
 */
async function renderCensoredAudio(
  sampleRate: number,
  numChannels: number,
  totalFrames: number,
  channelData: Float32Array[],   // per-channel concatenated data (owned by caller)
  rmsMap: Map<number, number>,
): Promise<AudioBuffer> {
  const totalDuration = totalFrames / sampleRate;

  const ctx = new OfflineAudioContext(numChannels, totalFrames, sampleRate);

  // Progress reporting
  ctx.onrenderprogress = () => {
    const done = ctx.currentTime;
    const pct = Math.round((done / totalDuration) * 100);
    playerActions.setExportStage(`Rendering censored audio... ${Math.round(done)}s / ${Math.round(totalDuration)}s (${pct}%)`);
  };

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

  // Play the whole audio through the gain node — one BufferSource
  const source = ctx.createBufferSource();
  source.buffer = ctx.createBuffer(numChannels, totalFrames, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    source.buffer.copyToChannel(channelData[ch], ch);
  }

  source.connect(gainNode);
  source.start(0);

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

  const result = ctx.startRendering();
  ctx.onrenderprogress = null; // done — prevent leaks
  return result;
}

/**
 * Pick best video codec for the output format.
 * If originalCodec is provided and encodable, it's used first.
 */
async function pickVideoCodec(format: 'mp4' | 'webm', originalCodec?: string | null): Promise<VideoCodec> {
  // Try the original codec first if provided
  if (originalCodec) {
    const encodable = await getEncodableVideoCodecs([originalCodec as VideoCodec]);
    if (encodable.length > 0) return encodable[0] as VideoCodec;
  }

  const preferred: VideoCodec[] = format === 'mp4' ? ['avc', 'hevc'] : ['vp9', 'vp8'];
  const encodable = await getEncodableVideoCodecs(preferred);
  if (encodable.length > 0) return encodable[0];

  const allEncodable = await getEncodableVideoCodecs(['avc', 'hevc', 'vp9', 'vp8', 'av1']);
  if (format === 'mp4') {
    return (allEncodable.find((c) => c === 'avc' || c === 'hevc') ?? allEncodable[0]) as VideoCodec;
  }
  return (allEncodable.find((c) => c === 'vp9' || c === 'vp8' as VideoCodec) ?? allEncodable[0]) as VideoCodec;
}

/**
 * Pick best audio codec for the output format.
 * If originalCodec is provided and encodable, it's used first.
 */
async function pickAudioCodec(format: 'mp4' | 'webm', originalCodec?: string | null): Promise<AudioCodec> {
  // Try the original codec first if provided
  if (originalCodec) {
    if (await canEncodeAudio(originalCodec as AudioCodec)) return originalCodec as AudioCodec;
  }

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
  originalVideoCodec?: string | null,
  originalAudioCodec?: string | null,
): Promise<ArrayBuffer> {
  const numChannels = audioTrack.numberOfChannels;
  const sampleRate = audioTrack.sampleRate;

  // --- Phase 1: Collect original audio + compute RMS incrementally ---
  const transcriptionResults = usePlayerStore.getState().transcriptionResults;
  const soundEffects = getSoundEffects();

  // For incremental RMS: accumulate per-segment sum-of-squares and count.
  // Keyed by segment start time.
  const rmsSumSq = new Map<number, number>();
  const rmsCount = new Map<number, number>();

  if (transcriptionResults) {
    for (const [start] of transcriptionResults) {
      rmsSumSq.set(start, 0);
      rmsCount.set(start, 0);
    }
  }

  // Per-channel concatenated Float32Array — we'll grow them incrementally
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channelData.push(new Float32Array(0)); // placeholder, will resize
  }

  let totalFrames = 0;
  let firstChunkFrames = 0;
  let estimatedTotalChunks = 1;

  for await (const { buffer } of audioSink.buffers(0)) {
    const chunkFrames = buffer.length;

    if (firstChunkFrames === 0) {
      firstChunkFrames = chunkFrames;
      const totalDuration = audioTrack.duration;
      estimatedTotalChunks = Math.max(1, Math.ceil(totalDuration * sampleRate / chunkFrames));
    }

    // Append per-channel data to the running arrays
    for (let ch = 0; ch < numChannels; ch++) {
      const src = buffer.getChannelData(ch);
      const dst = new Float32Array(totalFrames + chunkFrames);
      dst.set(channelData[ch]);
      dst.set(src, totalFrames);
      channelData[ch] = dst;
    }
    totalFrames += chunkFrames;

    // Incremental RMS from channel 0
    const ch0 = buffer.getChannelData(0);
    if (transcriptionResults) {
      for (const [start, end] of transcriptionResults) {
        const segStartFrame = Math.floor(start * sampleRate);
        const segEndFrame = Math.floor(end * sampleRate);
        const chunkStartFrame = totalFrames - chunkFrames;
        const chunkEndFrame = totalFrames;

        // Overlap of [segStart, segEnd) and [chunkStart, chunkEnd)
        const overlapStart = Math.max(segStartFrame, chunkStartFrame);
        const overlapEnd = Math.min(segEndFrame, chunkEndFrame);

        if (overlapEnd > overlapStart) {
          let sum = 0;
          for (let i = overlapStart - chunkStartFrame; i < overlapEnd - chunkStartFrame; i++) {
            sum += ch0[i] * ch0[i];
          }
          rmsSumSq.set(start, (rmsSumSq.get(start) ?? 0) + sum);
          rmsCount.set(start, (rmsCount.get(start) ?? 0) + (overlapEnd - overlapStart));
        }
      }
    }

    const progressPct = Math.round((totalFrames / (estimatedTotalChunks * firstChunkFrames)) * 100);
    playerActions.setExportStage(
      `Collecting audio... (${Math.ceil(totalFrames / firstChunkFrames)}/${estimatedTotalChunks} chunks, ${Math.min(progressPct, 100)}%)`,
    );
  }

  // Finalize RMS map
  const rmsMap = new Map<number, number>();
  for (const [start] of rmsSumSq.keys()) {
    const cnt = rmsCount.get(start) ?? 0;
    rmsMap.set(start, cnt > 0 ? Math.sqrt((rmsSumSq.get(start) ?? 0) / cnt) : 0);
  }

  // --- Phase 2: Decode bleep sounds ---
  playerActions.setExportStage('Preparing bleep sounds...');

  const decodeCtx = new OfflineAudioContext(1, 1, sampleRate);

  for (const effect of soundEffects) {
    const buf = await ensureBleepDecoded(effect.soundId, decodeCtx);
    if (!buf) {
      throw new Error(`Bleep sound "${effect.soundId}" could not be decoded`);
    }
  }
  await decodeCtx.startRendering();

  // --- Phase 3b: Render censored audio (RMS already done — no separate Phase 3) ---
  const censoredBuffer = await renderCensoredAudio(
    sampleRate,
    numChannels,
    totalFrames,
    channelData,
    rmsMap,
  );

  // --- Phase 4: Choose codecs ---
  playerActions.setExportStage('Choosing codecs...');
  const vidCodec = await pickVideoCodec(outputFormat, originalVideoCodec);
  const audCodec = await pickAudioCodec(outputFormat, originalAudioCodec);

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

    // Determine how many censored frames we can copy for this sample
    const available = Math.max(0, totalCensoredFrames - censoredFrameCursor);
    const copyLen = Math.min(available, framesNeeded);

    for (let ch = 0; ch < numChannels; ch++) {
      const dstOffset = ch * framesNeeded;
      const src = censoredChannelData[ch];
      for (let i = 0; i < copyLen; i++) {
        data[dstOffset + i] = src[censoredFrameCursor + i];
      }
      // rest stays zero (silence) if copyLen < framesNeeded
    }

    censoredFrameCursor += copyLen;

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
