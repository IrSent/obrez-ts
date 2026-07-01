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
import type { SoundCensoringEffect, BleepSound, ExportProgress, ExportPhase, PhaseStatus } from './types';
import type {
  Input,
  InputAudioTrack,
  AudioBufferSink,
  VideoCodec,
  AudioCodec,
} from 'mediabunny';

// ─── Progress helpers ──────────────────────────────────────────────

/**
 * Build the initial phase list for the export pipeline.
 */
function makeInitialPhases(): ExportPhase[] {
  return [
    { key: 'collect',  label: 'Collecting audio',    status: 'pending' as PhaseStatus, pct: 0, detail: null },
    { key: 'bleep',    label: 'Preparing bleeps',     status: 'pending' as PhaseStatus, pct: 0, detail: null },
    { key: 'render',   label: 'Rendering censored',   status: 'pending' as PhaseStatus, pct: 0, detail: null },
    { key: 'codec',    label: 'Choosing codecs',      status: 'pending' as PhaseStatus, pct: 0, detail: null },
    { key: 'encode',   label: 'Encoding video',       status: 'pending' as PhaseStatus, pct: 0, detail: null },
  ];
}

/**
 * Read current progress from store, update one phase immutably, and write back.
 */
function updatePhase(key: string, patch: Partial<ExportPhase>): void {
  const current = usePlayerStore.getState().exportProgress;
  if (!current) return;
  const newProgress: ExportProgress = {
    ...current,
    phases: current.phases.map((p) => p.key === key ? { ...p, ...patch } : p),
  };
  playerActions.setExportProgress(newProgress);
}

/**
 * Update the elapsed time in progress.
 */
function setElapsed(seconds: number): void {
  const current = usePlayerStore.getState().exportProgress;
  if (!current) return;
  playerActions.setExportProgress({ ...current, elapsed: seconds });
}

/**
 * Build the initial progress object and set it in the store.
 */
function initProgress(): ExportProgress {
  const progress = { phases: makeInitialPhases(), elapsed: 0 };
  playerActions.setExportProgress(progress);
  return progress;
}

// ─── Bleep sound helpers ────────────────────────────────────────────

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

  let arrayBuffer: ArrayBuffer | null = null;

  if (sound.dataUrl) {
    try {
      const resp = await fetch(sound.dataUrl);
      arrayBuffer = await resp.arrayBuffer();
    } catch { /* fall through */ }
  }

  if (!arrayBuffer && sound.url) {
    try {
      const resp = await fetch(sound.url);
      arrayBuffer = await resp.arrayBuffer();
    } catch { /* fall through */ }
  }

  if (!arrayBuffer) return null;

  const decoded = await ctx.decodeAudioData(arrayBuffer);
  // Cache via Zustand so Phase 3 (applyBleepSounds) reuses it
  playerActions.setBleepBuffer(soundId, decoded);
  return decoded;
}

// ─── Effect helpers ─────────────────────────────────────────────────

function getSoundEffects(): SoundCensoringEffect[] {
  const raw = usePlayerStore.getState().censoringEffects ?? [];
  return raw
    .filter((e: typeof raw[number]): e is SoundCensoringEffect => e.effectType === 'sound')
    .sort((a, b) => a.segmentStart - b.segmentStart);
}

// ─── OfflineAudioContext rendering (main thread, segmented) ─────────

/**
 * Compute segment boundaries from effects.
 * Segments are defined by the start/end times of transcription results
 * associated with censoring effects. Each effect falls entirely within
 * one segment — no splitting across boundaries.
 */
function computeSegmentBoundaries(
  soundEffects: SoundCensoringEffect[],
  transcriptionResults: [number, number, string][],
  totalDuration: number,
): [number, number][] {
  // Collect all unique boundaries from effects
  const boundarySet = new Set<number>();
  boundarySet.add(0);
  boundarySet.add(totalDuration);

  for (const effect of soundEffects) {
    const seg = transcriptionResults.find(
      ([s]) => Math.abs(s - effect.segmentStart) < 0.01,
    );
    if (!seg) continue;
    boundarySet.add(seg[0]); // start
    boundarySet.add(seg[1]); // end
  }

  // Sort boundaries and create segments
  const sorted = Array.from(boundarySet).sort((a, b) => a - b);
  const segments: [number, number][] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end > start) {
      segments.push([start, end]);
    }
  }

  return segments;
}

/**
 * Find which effects belong to a given segment [segStart, segEnd].
 * An effect belongs if its transcription segment is entirely within [segStart, segEnd].
 */
function effectsForSegment(
  soundEffects: SoundCensoringEffect[],
  transcriptionResults: [number, number, string][],
  segStart: number,
  segEnd: number,
): SoundCensoringEffect[] {
  const eps = 0.01;
  return soundEffects.filter((e) => {
    const seg = transcriptionResults.find(
      ([s]) => Math.abs(s - e.segmentStart) < eps,
    );
    if (!seg) return false;
    return seg[0] >= segStart - eps && seg[1] <= segEnd + eps;
  });
}

/**
 * Render a single segment using OfflineAudioContext.
 * `segChannelData` is already the audio for this segment only (one Float32Array per channel).
 * `getRms` returns RMS for a segment-start index (auto-volume bleeps), computed on-demand.
 */
async function renderSegment(
  segChannelData: Float32Array[],
  sampleRate: number,
  getRms: (segStart: number) => number,
  globalTranscriptionResults: [number, number, string][],
  segmentEffects: SoundCensoringEffect[],
  segStartFrames: number,
): Promise<AudioBuffer> {
  const segFrameCount = segChannelData[0].length;
  const segDuration = segFrameCount / sampleRate;

  const ctx = new OfflineAudioContext(segChannelData.length, segFrameCount, sampleRate);

  // Build segment audio buffer from channel data
  const segBuffer = ctx.createBuffer(segChannelData.length, segFrameCount, sampleRate);
  for (let ch = 0; ch < segChannelData.length; ch++) {
    segBuffer.copyToChannel(segChannelData[ch], ch);
  }

  // Gain node for dampening
  const gainNode = ctx.createGain();
  gainNode.gain.value = 1;
  gainNode.connect(ctx.destination);

  // Dampening — effects are fully within this segment, use local times
  for (const effect of segmentEffects) {
    if (effect.effectType !== 'sound' || !effect.dampenOriginal) continue;

    const seg = globalTranscriptionResults.find(
      ([s]) => Math.abs(s - effect.segmentStart) < 0.01,
    );
    if (!seg) continue;

    const [start, end] = seg;
    const localStart = start - segStartFrames / sampleRate;
    const localEnd = end - segStartFrames / sampleRate;
    const dampenedGain = 1 - (effect.dampenAmount ?? 1);

    if (effect.dampenType === 'sharp') {
      gainNode.gain.setValueAtTime(dampenedGain, localStart);
      gainNode.gain.setValueAtTime(1, localEnd);
    } else {
      const tau = (localEnd - localStart) * 0.3;
      gainNode.gain.setValueAtTime(dampenedGain, localStart);
      gainNode.gain.setTargetAtTime(1, localStart + tau, tau);
      gainNode.gain.setValueAtTime(1, localEnd);
    }
  }

  // Play the segment buffer
  const source = ctx.createBufferSource();
  source.buffer = segBuffer;
  source.connect(gainNode);
  source.start(0);

  // Bleep sounds — use local times
  for (const effect of segmentEffects) {
    if (effect.effectType !== 'sound') continue;

    const cached = usePlayerStore.getState().bleepSounds[effect.soundId]?.audioBuffer;
    if (!cached) continue;

    const bleepSource = ctx.createBufferSource();
    bleepSource.buffer = cached;
    bleepSource.playbackRate.value = effect.playbackRate ?? 1;

    const bleepGain = ctx.createGain();
    const bleepVolume = effect.volumeMode === 'auto'
      ? Math.min(1, getRms(effect.segmentStart) / 0.2)
      : (effect.volume ?? 1);
    bleepGain.gain.value = bleepVolume ** 2;

    bleepSource.connect(bleepGain);
    bleepGain.connect(ctx.destination);
    const localBleepStart = effect.segmentStart - segStartFrames / sampleRate;
    bleepSource.start(localBleepStart);
  }

  return ctx.startRendering();
}

// ─── Codec selection ────────────────────────────────────────────────

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

// ─── Writable buffer (shared between collector and renderer) ────────

/**
 * Growable per-channel Float32Array buffer with frame-ready signaling.
 * The collector writes frames sequentially; the renderer waits until
 * a given frame range is fully populated before reading.
 *
 * Supports multiple concurrent waiters — each call to wait() gets its own
 * promise that resolves when enough frames have been collected.
 */
class WritableBuffer {
  public channels: Float32Array[] = [];
  private totalFrames = 0;
  private collectedFrames = 0;
  private lastPct = -1;
  private _done = false;

  // Queue of pending waiters, sorted by frames threshold (ascending).
  // Each entry resolves when collectedFrames >= its threshold.
  private waitQueue: { frames: number; resolve: () => void }[] = [];

  constructor(
    readonly numChannels: number,
    readonly sampleRate: number,
    readonly estimatedTotalFrames: number,
    readonly exportStart: number,
  ) {
    // Over-allocate with 10% margin to minimize growth events during parallel render
    this.estimatedTotalFrames = Math.ceil(this.estimatedTotalFrames * 1.1);
  }

  /** Get channel data array (may change on grow). */
  getChannel(ch: number): Float32Array {
    return this.channels[ch];
  }

  get collectedFramesCount(): number {
    return this.collectedFrames;
  }

  /** Initialize channels on first chunk. */
  init(chunkFrames: number): void {
    for (let ch = 0; ch < this.numChannels; ch++) {
      this.channels.push(new Float32Array(this.estimatedTotalFrames));
    }
  }

  /** Grow all channels if needed. */
  ensure(totalNeeded: number): void {
    if (totalNeeded <= this.channels[0].length) return;
    const newLen = (this.channels[0].length + totalNeeded) * 2;
    for (let ch = 0; ch < this.numChannels; ch++) {
      const dst = new Float32Array(newLen);
      dst.set(this.channels[ch]);
      this.channels[ch] = dst;
    }
  }

  /** Write a chunk and signal readiness. */
  write(chunk: AudioBuffer, chunkFrames: number, chunkCount: number, estimatedTotalChunks: number): void {
    this.ensure(this.collectedFrames + chunkFrames);
    for (let ch = 0; ch < this.numChannels; ch++) {
      this.channels[ch].set(chunk.getChannelData(ch), this.collectedFrames);
    }
    this.collectedFrames += chunkFrames;
    this.totalFrames = Math.max(this.totalFrames, this.collectedFrames);

    // Resolve all waiters whose threshold is now met
    let i = 0;
    while (i < this.waitQueue.length && this.collectedFrames >= this.waitQueue[i].frames) {
      this.waitQueue[i].resolve();
      i++;
    }
    this.waitQueue.splice(0, i);

    // Progress
    const pct = Math.round((chunkCount / estimatedTotalChunks) * 100);
    const elapsed = ((performance.now() - this.exportStart) / 1000).toFixed(1);
    if (Math.abs(pct - this.lastPct) >= 2) {
      this.lastPct = pct;
      const detail = `${elapsed}s · ${chunkCount}/${estimatedTotalChunks} chunks`;
      updatePhase('collect', { pct, detail });
      setElapsed(parseFloat(elapsed));
    }
  }

  /** Resolve when at least `frames` frames have been collected, or when done is signaled. */
  async wait(frames: number): Promise<void> {
    if (this._done || this.collectedFrames >= frames) return;
    return new Promise<void>((resolve) => {
      this.waitQueue.push({ frames, resolve });
    });
  }

  /** Signal that no more frames will be written — unblocks pending waiters. */
  markDone(): void {
    this._done = true;
    for (const waiter of this.waitQueue) {
      waiter.resolve();
    }
    this.waitQueue.length = 0;
  }

  /** Final channel data arrays (trimmed to actual size). */
  finalize(): Float32Array[] {
    const actual = this.totalFrames;
    const trimmed: Float32Array[] = [];
    for (let ch = 0; ch < this.numChannels; ch++) {
      trimmed.push(this.channels[ch].subarray(0, actual));
    }
    return trimmed;
  }
}

// ─── Main export ────────────────────────────────────────────────────

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
  const totalDuration = usePlayerStore.getState().duration;
  const transcriptionResults = usePlayerStore.getState().transcriptionResults ?? [];

  const exportStart = performance.now();
  const soundEffects = getSoundEffects();

  console.log('[export] starting, format=', outputFormat, 'channels=', numChannels, 'sampleRate=', sampleRate);
  const progress = initProgress();

  // --- Shared writable buffer: collector writes, renderer reads ---
  const wbuf = new WritableBuffer(
    numChannels, sampleRate,
    Math.ceil(totalDuration * sampleRate),
    exportStart,
  );

  // --- Auto-volume RMS tracking (incremental, same logic as before) ---
  const autoVolumeStarts = new Set(
    soundEffects.filter((e) => e.volumeMode === 'auto').map((e) => e.segmentStart),
  );
  const rmsMap = new Map<number, number>();
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

  // --- RMS on-demand: compute from incremental sums as soon as a segment is done ---
  const getRms = (segStart: number): number => {
    const idx = autoSegs.findIndex((s) => Math.abs(s.segStart - segStart) < 0.01);
    if (idx >= 0 && segCounts[idx] > 0) {
      const val = Math.sqrt(segSums[idx] / segCounts[idx]);
      rmsMap.set(autoSegs[idx].segStart, val);
      return val;
    }
    return 0.2; // fallback
  };

  // --- Collector task: consume audioSink, fill wbuf, compute RMS ---
  updatePhase('collect', { status: 'active' });
  const collectTask = (async () => {
    let firstChunkFrames = 0;
    let chunkCount = 0;
    let segPtrStart = 0;

    for await (const { buffer } of audioSink.buffers(0)) {
      const chunkFrames = buffer.length;

      if (firstChunkFrames === 0) {
        firstChunkFrames = chunkFrames;
        wbuf.init(chunkFrames);
      }

      const estimatedTotalChunks = Math.max(1, Math.ceil(totalDuration * sampleRate / firstChunkFrames));

      // RMS computation (same as before)
      if (autoSegs.length > 0) {
        const bufStart = (chunkCount) * firstChunkFrames;
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

      wbuf.write(buffer, chunkFrames, chunkCount + 1, estimatedTotalChunks);
      chunkCount++;
    }

    // Compute final RMS values
    for (let i = 0; i < autoSegs.length; i++) {
      if (segCounts[i] > 0) {
        rmsMap.set(autoSegs[i].segStart, Math.sqrt(segSums[i] / segCounts[i]));
      }
    }

    // Signal that no more frames will be written — unblocks renderSegmentData
    // which may be waiting for a segment that exceeds actual audio length
    wbuf.markDone();

    updatePhase('collect', { status: 'done', pct: 100, detail: `${chunkCount} chunks` });
    console.log('[export] Collect done,', chunkCount, 'chunks,', wbuf.collectedFramesCount, 'frames');
  })();

  // --- Prep task: bleep + codec (runs while audio is being collected) ---
  const prepTask = (async () => {
    // Phase 2: Decode bleep sounds
    console.log('[export] Phase 2: preparing bleeps');
    updatePhase('bleep', { status: 'active' });

    const decodeCtx = new OfflineAudioContext(1, 1, sampleRate);
    for (const effect of soundEffects) {
      const buf = await ensureBleepDecoded(effect.soundId, decodeCtx);
      if (!buf) {
        throw new Error(`Bleep sound "${effect.soundId}" could not be decoded`);
      }
    }
    await decodeCtx.startRendering();

    updatePhase('bleep', { status: 'done', pct: 100, detail: `${soundEffects.length} bleeps` });
    console.log('[export] Phase 2 done, bleeps prepared');

    // Phase 3: Choose codecs
    console.log('[export] Phase 3: choosing codecs');
    updatePhase('codec', { status: 'active' });

    const vidCodec = await pickVideoCodec(outputFormat, originalVideoCodec);
    const audCodec = await pickAudioCodec(outputFormat, originalAudioCodec);
    const codecLabel = `${vidCodec} + ${audCodec}`;
    updatePhase('codec', { status: 'done', pct: 100, detail: codecLabel });

    return { vidCodec, audCodec };
  })();

  // --- Render + Encode task: starts as soon as prep is done and first segment frames are ready ---
  const renderEncodeTask = async () => {
    // Wait for prep (bleep + codec) to finish
    const { vidCodec, audCodec } = await prepTask;

    updatePhase('render', { status: 'active', pct: 0, detail: 'starting' });
    let lastPct = -1;

    const rawSegments = computeSegmentBoundaries(soundEffects, transcriptionResults, totalDuration);
    const maxSegmentFrames = Math.ceil(60 * sampleRate);
    const segments: [number, number][] = [];
    for (const [start, end] of rawSegments) {
      const frames = (end - start) * sampleRate;
      if (frames <= maxSegmentFrames) {
        segments.push([start, end]);
      } else {
        let cur = start;
        while (cur < end) {
          const next = Math.min(cur + 60, end);
          segments.push([cur, next]);
          cur = next;
        }
      }
    }

    console.log(
      '[export] pipeline:', segments.length, 'segments,',
      '(total', totalDuration.toFixed(1), 's)',
    );

    const format = outputFormat === 'mp4'
      ? new Mp4OutputFormat()
      : new WebMOutputFormat();

    const bufferTarget = new BufferTarget();
    const output = new Output({ format, target: bufferTarget });

    // Pipeline state
    let segIndex = 0;
    let segData: Float32Array[] = [];
    let segOffset = 0;
    let segFrames = 0;
    let aheadData: Float32Array[] | null = null;
    let aheadFrames = 0;
    let aheadPromise: Promise<void> | null = null;

    const renderSegmentData = async (index: number): Promise<{ data: Float32Array[]; frames: number }> => {
      if (index >= segments.length) {
        return { data: [], frames: 0 };
      }

      const [segStart, segEnd] = segments[index];
      const segStartFrames = Math.floor(segStart * sampleRate);
      const segEndFrames = Math.ceil(segEnd * sampleRate);

      // Wait for enough audio to be collected for this segment
      await wbuf.wait(segEndFrames);

      const segEffects = effectsForSegment(
        soundEffects, transcriptionResults, segStart, segEnd,
      );

      // Copy segment data out of wbuf BEFORE rendering to avoid race with buffer growth.
      // wbuf.ensure() may replace channels[ch] — .slice() gives us an independent copy.
      const segChannelData: Float32Array[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        segChannelData.push(wbuf.channels[ch].subarray(segStartFrames, segEndFrames).slice());
      }

      const result = await renderSegment(
        segChannelData, sampleRate, getRms,
        transcriptionResults, segEffects, segStartFrames,
      );

      const chData: Float32Array[] = [];
      for (let ch = 0; ch < numChannels; ch++) {
        chData.push(result.getChannelData(ch));
      }

      // Progress
      const doneS = Math.min(segEnd, totalDuration);
      const pct = Math.round((doneS / totalDuration) * 100);
      const elapsedSecs = (performance.now() - exportStart) / 1000;
      const elapsed = elapsedSecs.toFixed(1);
      const eta = doneS > 0
        ? ((totalDuration - doneS) * elapsedSecs / doneS).toFixed(1)
        : '—';
      const detail = `segment ${index + 1}/${segments.length} · ${Math.round(doneS)}s / ${Math.round(totalDuration)}s · ${elapsed}s · ETA ${eta}s`;
      console.log('[export] render progress:', pct, '%', detail);
      updatePhase('render', { pct, detail });
      setElapsed(parseFloat(elapsed));

      return { data: chData, frames: result.length };
    };

    const startAheadRender = (index: number) => {
      aheadPromise = (async () => {
        try {
          const seg = await renderSegmentData(index);
          aheadData = seg.data;
          aheadFrames = seg.frames;
        } catch {
          // If ahead render fails, treat as no data — the main loop will
          // fill silence and finish. This prevents unhandled rejections
          // from killing the pipeline.
          aheadData = null;
          aheadFrames = 0;
        }
      })();
    };

    const audioProcess = async (_sample: AudioSample) => {
      const framesNeeded = _sample.numberOfFrames;
      const ts = _sample.timestamp;
      const sampleRate = _sample.sampleRate;
      const numCh = _sample.numberOfChannels;

      // Close the input sample immediately — we've read what we need
      _sample.close();

      const data = new Float32Array(numCh * framesNeeded);

      try {
        // Load the first segment
        if (segIndex === 0 && segFrames === 0) {
          const seg = await renderSegmentData(0);
          segData = seg.data;
          segFrames = seg.frames;
          segIndex++;
          if (segIndex < segments.length) {
            startAheadRender(segIndex);
          }
        }

        let remaining = framesNeeded;
        while (remaining > 0) {
          if (segFrames === 0) {
            remaining = 0;
            break;
          }

          const available = segFrames - segOffset;
          const copyLen = Math.min(available, remaining);

          for (let ch = 0; ch < numCh; ch++) {
            const dstOffset = ch * framesNeeded + (framesNeeded - remaining);
            const src = segData[ch];
            for (let i = 0; i < copyLen; i++) {
              data[dstOffset + i] = src[segOffset + i];
            }
          }

          segOffset += copyLen;
          remaining -= copyLen;

          if (segOffset >= segFrames) {
            if (aheadPromise && aheadData === null) {
              await aheadPromise;
            }

            segData.length = 0;

            if (aheadData !== null && aheadFrames > 0) {
              segData = aheadData;
              segFrames = aheadFrames;
              segOffset = 0;
              aheadData = null;
              aheadFrames = 0;
            } else {
              segFrames = 0;
            }

            segIndex++;

            if (segIndex < segments.length) {
              startAheadRender(segIndex);
            }
          }
        }
      } catch (e) {
        console.error('[export] audioProcess error:', e);
        // Fill silence on error — don't let the pipeline crash
      }

      return new AudioSample({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: framesNeeded,
        numberOfChannels: numCh,
        timestamp: ts,
        data,
      });
    };

    updatePhase('encode', { status: 'active', pct: 0, detail: 'starting' });

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

    conversion.onProgress = (prog) => {
      const pct = Math.round(prog * 100);
      if (Math.abs(pct - lastPct) < 2) return;
      lastPct = pct;
      const elapsed = ((performance.now() - exportStart) / 1000).toFixed(1);
      const detail = `seg ${Math.min(segIndex, segments.length)}/${segments.length} · ${elapsed}s`;
      updatePhase('encode', { pct, detail });
      setElapsed(parseFloat(elapsed));
    };

    await conversion.execute();

    const result = bufferTarget.buffer;
    if (!result) {
      throw new Error('Export completed but no output buffer was produced');
    }

    updatePhase('render', { status: 'done', pct: 100, detail: 'done' });
    updatePhase('encode', { status: 'done', pct: 100, detail: 'complete' });

    return result;
  };

  // --- Kick off collect, then render+encode (which waits for prep) ---
  // Collect runs immediately; prep starts in parallel inside renderEncodeTask.
  try {
    const result = await renderEncodeTask();
    // Ensure collection has finished (it likely already has)
    await collectTask;
    return result;
  } catch (err) {
    // If render+encode fails, we still need to clean up
    await collectTask.catch(() => {});
    throw err;
  }
}
