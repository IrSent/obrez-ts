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
 * Render censored audio using a single OfflineAudioContext.
 * onrenderprogress with batching (≥2%) for progress updates.
 */
async function renderCensoredAudio(
  audioChunks: AudioBuffer[],
  sampleRate: number,
  numChannels: number,
  rmsMap: Map<number, number>,
  exportStartTs: number,
): Promise<AudioBuffer> {
  const totalFrames = audioChunks.reduce((sum, buf) => sum + buf.length, 0);
  const totalDuration = totalFrames / sampleRate;

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

  // Play each chunk through the gain node
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
    const bleepVolume = effect.volumeMode === 'auto'
      ? Math.min(1, (rmsMap.get(effect.segmentStart) ?? 0.2) / 0.2)
      : effect.volume;
    bleepGain.gain.value = bleepVolume ** 2;
    bleepSource.connect(bleepGain);
    bleepGain.connect(ctx.destination);
    bleepSource.start(effect.segmentStart);
  }

  // Batched onrenderprogress — only write to store when pct changes ≥2%
  let lastRenderPct = -2;
  ctx.onrenderprogress = () => {
    const done = ctx.currentTime;
    const pct = Math.round((done / totalDuration) * 100);
    if (Math.abs(pct - lastRenderPct) < 2) return;
    lastRenderPct = pct;
    const elapsed = ((performance.now() - exportStartTs) / 1000).toFixed(1);
    const eta = done > 0
      ? ((totalDuration - done) * (performance.now() - exportStartTs) / (done * 1000)).toFixed(1)
      : '—';
    playerActions.setExportStage(
      `Rendering censored audio... ${Math.round(done)}s / ${Math.round(totalDuration)}s · ${pct}% · ETA ${eta}s`,
    );
  };

  const result = ctx.startRendering();
  result.finally(() => { ctx.onrenderprogress = null; });
  return result;
}

/**
 * Pick best video codec for the output format.
 * If originalCodec is provided and encodable, it's used first.
 */
async function pickVideoCodec(format: 'mp4' | 'webm', originalCodec?: string | null): Promise<VideoCodec> {
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

  // --- Phase 1: Collect original audio buffers + pre-compute RMS ---
  const audioBuffers: AudioBuffer[] = [];
  let firstChunkFrames = 0;
  let estimatedTotalChunks = 1;

  const exportStart = performance.now();
  const updateProgress = (message: string) => {
    playerActions.setExportStage(message);
  };

  // Batch progress: only write to store when percentage changes by ≥2%.
  let lastPct = -1;
  const batchedProgress = (pct: number, elapsed: string, cur: number, est: number) => {
    if (Math.abs(pct - lastPct) < 2) return;
    lastPct = pct;
    updateProgress(`Collecting audio... ${elapsed}s · ${cur}/${est} chunks · ${pct}%`);
  };

  // Pre-compute RMS map during collection — no separate Phase 3 needed.
  // We accumulate sum-of-squares per segment while iterating chunks,
  // then finalize the RMS values after collection.
  //
  // OPTIMIZATION: only compute RMS for segments that actually have
  // auto-volume bleep effects — most segments don't need it.
  const soundEffectsEarly = getSoundEffects();
  const autoVolumeStarts = new Set(
    soundEffectsEarly
      .filter((e) => e.volumeMode === 'auto')
      .map((e) => e.segmentStart),
  );

  const transcriptionResults = usePlayerStore.getState().transcriptionResults;
  const rmsMap = new Map<number, number>();

  // Precompute auto-volume segment frame ranges (sorted, non-overlapping).
  // We use a pointer (segPtr) to walk this list — no per-chunk scan needed.
  const autoSegs: { start: number; end: number; segStart: number }[] = [];
  if (transcriptionResults && autoVolumeStarts.size > 0) {
    for (const [segStart, segEnd] of transcriptionResults) {
      if (!autoVolumeStarts.has(segStart)) continue;
      autoSegs.push({
        start: Math.floor(segStart * sampleRate),
        end: Math.floor(segEnd * sampleRate),
        segStart,
      });
    }
  }

  const segSums = new Float64Array(autoSegs.length);
  const segCounts = new Float64Array(autoSegs.length);
  let segPtrStart = 0;

  for await (const { buffer } of audioSink.buffers(0)) {
    audioBuffers.push(buffer);
    const chunkFrames = buffer.length;

    if (firstChunkFrames === 0) {
      firstChunkFrames = chunkFrames;
      const totalDuration = usePlayerStore.getState().duration;
      estimatedTotalChunks = Math.max(1, Math.ceil(totalDuration * sampleRate / chunkFrames));
    }

    // Accumulate RMS via pointer walk over auto-volume segments.
    // Segments are sorted and non-overlapping → advance segPtr monotonically.
    if (autoSegs.length > 0) {
      const bufStart = (audioBuffers.length - 1) * firstChunkFrames;
      const bufEnd = bufStart + chunkFrames;
      const ch0 = buffer.getChannelData(0);

      let segPtr = segPtrStart;
      while (segPtr < autoSegs.length) {
        const seg = autoSegs[segPtr];
        if (seg.start >= bufEnd) break;
        if (seg.end <= bufStart) { segPtr++; continue; }

        const oStart = Math.max(bufStart, seg.start);
        const oEnd = Math.min(bufEnd, seg.end);
        const localStart = oStart - bufStart;
        const count = oEnd - oStart;

        let sumSq = 0;
        for (let j = 0; j < count; j++) {
          const s = ch0[localStart + j];
          sumSq += s * s;
        }
        segSums[segPtr] += sumSq;
        segCounts[segPtr] += count;
        segPtr++;
      }
      segPtrStart = segPtr;
    }

    const pct = Math.round((audioBuffers.length / estimatedTotalChunks) * 100);
    const elapsed = ((performance.now() - exportStart) / 1000).toFixed(1);
    batchedProgress(pct, elapsed, audioBuffers.length, estimatedTotalChunks);
  }

  // Finalize RMS values
  for (let i = 0; i < autoSegs.length; i++) {
    if (segCounts[i] > 0) {
      rmsMap.set(autoSegs[i].segStart, Math.sqrt(segSums[i] / segCounts[i]));
    }
  }

  const totalFrames = audioBuffers.reduce((sum, buf) => sum + buf.length, 0);

  // --- Phase 2: Decode bleep sounds ---
  const elapsed2 = ((performance.now() - exportStart) / 1000).toFixed(1);
  playerActions.setExportStage(`Preparing bleep sounds... (${elapsed2}s elapsed)`);

  const decodeCtx = new OfflineAudioContext(1, 1, sampleRate);
  const soundEffects = getSoundEffects();

  for (const effect of soundEffects) {
    const buf = await ensureBleepDecoded(effect.soundId, decodeCtx);
    if (!buf) {
      throw new Error(`Bleep sound "${effect.soundId}" could not be decoded`);
    }
  }
  await decodeCtx.startRendering();

  // --- Phase 3: Render censored audio (single OfflineAudioContext) ---
  const totalDuration = totalFrames / sampleRate;
  const elapsed3 = ((performance.now() - exportStart) / 1000).toFixed(1);
  playerActions.setExportStage(`Rendering censored audio... ${Math.round(totalDuration)}s total · ${elapsed3}s elapsed`);

  const censoredBuffer = await renderCensoredAudio(
    audioBuffers,
    sampleRate,
    numChannels,
    rmsMap,
    exportStart,
  );

  // Free original audio buffers
  audioBuffers.length = 0;

  // --- Phase 4: Choose codecs ---
  const vidCodec = await pickVideoCodec(outputFormat, originalVideoCodec);
  const audCodec = await pickAudioCodec(outputFormat, originalAudioCodec);
  const elapsed4 = ((performance.now() - exportStart) / 1000).toFixed(1);
  playerActions.setExportStage(`Codecs: ${vidCodec} + ${audCodec} (${elapsed4}s elapsed)`);

  // --- Phase 5: Convert with mediabunny ---
  playerActions.setExportStage(`Encoding video... 0%`);
  const format = outputFormat === 'mp4'
    ? new Mp4OutputFormat()
    : new WebMOutputFormat();

  const bufferTarget = new BufferTarget();
  const output = new Output({ format, target: bufferTarget });

  // Consume censored audio as a stream of frames.
  const censoredChannelData: Float32Array[] = [];
  for (let ch = 0; ch < censoredBuffer.numberOfChannels; ch++) {
    censoredChannelData.push(censoredBuffer.getChannelData(ch));
  }
  let censoredFrameCursor = 0;
  const totalCensoredFrames = censoredBuffer.length;

  const audioProcess = async (_sample: AudioSample) => {
    const framesNeeded = _sample.numberOfFrames;
    const ts = _sample.timestamp;

    const data = new Float32Array(numChannels * framesNeeded);

    const available = Math.max(0, totalCensoredFrames - censoredFrameCursor);
    const copyLen = Math.min(available, framesNeeded);

    for (let ch = 0; ch < numChannels; ch++) {
      const dstOffset = ch * framesNeeded;
      const src = censoredChannelData[ch];
      for (let i = 0; i < copyLen; i++) {
        data[dstOffset + i] = src[censoredFrameCursor + i];
      }
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
      if (Math.abs(pct - lastPct) < 2) return;
      lastPct = pct;
      const elapsed = ((performance.now() - exportStart) / 1000).toFixed(1);
      playerActions.setExportStage(`Encoding... ${pct}% · ${elapsed}s`);
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
