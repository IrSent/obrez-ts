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
import type { SoundCensoringEffect, BleepSound } from './types';
import type {
  Input,
  InputAudioTrack,
  AudioBufferSink,
  VideoCodec,
  AudioCodec,
} from 'mediabunny';

// ─── Bleep sound helpers ─────────────────────────────────────────────

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

/**
 * Build BleepData array from the store for worker transfer.
 */
interface BleepData {
  soundId: string;
  dataUrl: string | null;
  url: string | null;
}

function buildBleepData(soundEffects: SoundCensoringEffect[]): BleepData[] {
  const ids = new Set(soundEffects.map((e) => e.soundId));
  const bleeps: BleepData[] = [];
  for (const id of ids) {
    const sound = usePlayerStore.getState().bleepSounds[id];
    if (sound) {
      bleeps.push({
        soundId: id,
        dataUrl: sound.dataUrl || null,
        url: sound.url || null,
      });
    }
  }
  return bleeps;
}

// ─── Effect helpers ───────────────────────────────────────────────────

function getSoundEffects(): SoundCensoringEffect[] {
  const raw = usePlayerStore.getState().censoringEffects ?? [];
  return raw
    .filter((e: typeof raw[number]): e is SoundCensoringEffect => e.effectType === 'sound')
    .sort((a, b) => a.segmentStart - b.segmentStart);
}

// ─── Worker-based audio rendering ─────────────────────────────────────

interface SoundEffect {
  effectType: 'sound';
  id: string;
  soundId: string;
  segmentStart: number;
  dampenOriginal?: boolean;
  dampenAmount?: number;
  dampenType?: 'sharp' | 'smooth';
  volumeMode?: 'auto' | 'manual';
  volume?: number;
  playbackRate?: number;
}

/**
 * Cast SoundCensoringEffect[] → SoundEffect[] for worker protocol.
 */
function toWorkerEffects(effects: SoundCensoringEffect[]): SoundEffect[] {
  return effects.map((e) => ({
    effectType: 'sound' as const,
    id: e.id,
    soundId: e.soundId,
    segmentStart: e.segmentStart,
    dampenOriginal: e.dampenOriginal,
    dampenAmount: e.dampenAmount,
    dampenType: e.dampenType,
    volumeMode: e.volumeMode,
    volume: e.volume,
    playbackRate: e.playbackRate,
  }));
}

/**
 * Flatten AudioBuffer[] into a single ArrayBuffer (planar layout:
 * all samples of channel 0, then channel 1, etc.).
 * Returns { flatBuffer, chunkLengths, numChannels, sampleRate }.
 */
function flattenAudioBuffers(buffers: AudioBuffer[]): {
  flatBuffer: ArrayBuffer;
  chunkLengths: number[];
  numChannels: number;
  sampleRate: number;
} {
  const numChannels = buffers[0].numberOfChannels;
  const sampleRate = buffers[0].sampleRate;
  const chunkLengths: number[] = [];
  let totalFrames = 0;

  for (const buf of buffers) {
    chunkLengths.push(buf.length);
    totalFrames += buf.length;
  }

  // Allocate one ArrayBuffer per channel, then merge.
  // Total bytes = totalFrames * numChannels * 4 (Float32)
  const totalBytes = totalFrames * numChannels * 4;
  const flatBuffer = new ArrayBuffer(totalBytes);
  const flat = new Float32Array(flatBuffer);

  let offset = 0;
  for (const buf of buffers) {
    for (let ch = 0; ch < numChannels; ch++) {
      const src = buf.getChannelData(ch);
      for (let i = 0; i < buf.length; i++) {
        flat[offset + ch * buf.length + i] = src[i];
      }
    }
    offset += numChannels * buf.length;
  }

  return { flatBuffer, chunkLengths, numChannels, sampleRate };
}

/**
 * Render censored audio using the audio-export worker.
 * Audio data is flattened into a single ArrayBuffer and transferred
 * to the worker — no structured clone overhead on ~450 MB of audio.
 * The worker sends PROGRESS messages that are relayed to exportStage.
 */
async function renderCensoredAudioWorker(
  audioBuffers: AudioBuffer[],
  sampleRate: number,
  numChannels: number,
  rmsMap: Map<number, number>,
  exportStartTs: number,
): Promise<AudioBuffer> {
  const soundEffects = getSoundEffects();
  const transcriptionResults = usePlayerStore.getState().transcriptionResults ?? [];
  const workerEffects = toWorkerEffects(soundEffects);
  const bleepData = buildBleepData(soundEffects);

  const { flatBuffer, chunkLengths } = flattenAudioBuffers(audioBuffers);

  const totalDuration = audioBuffers.reduce((s, b) => s + b.length, 0) / sampleRate;

  return new Promise<AudioBuffer>((resolve, reject) => {
    const worker = new Worker('/audio-export.worker.js');

    worker.onmessage = (e) => {
      switch (e.data.type) {
        case 'PROGRESS': {
          const p = e.data.payload as { done: number; total: number; pct: number };
          const done = p.done;
          const pct = p.pct;
          const elapsed = ((performance.now() - exportStartTs) / 1000).toFixed(1);
          const eta = done > 0
            ? ((totalDuration - done) * (performance.now() - exportStartTs) / (done * 1000)).toFixed(1)
            : '—';
          playerActions.setExportStage(
            `Rendering censored audio... ${Math.round(done)}s / ${Math.round(totalDuration)}s · ${pct}% · ${elapsed}s · ETA ${eta}s`,
          );
          break;
        }
        case 'RENDER_READY': {
          const buf = e.data.payload as AudioBuffer;
          worker.terminate();
          resolve(buf);
          break;
        }
        case 'ERROR': {
          const msg = e.data.payload as string;
          worker.terminate();
          reject(new Error(`Worker render error: ${msg}`));
          break;
        }
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(`Worker error: ${err.message}`));
    };

    try {
      worker.postMessage({
        type: 'RENDER',
        payload: {
          flatBuffer,
          chunkLengths,
          sampleRate,
          numChannels,
          rmsMapData: [...rmsMap.entries()],
          soundEffects: workerEffects,
          transcriptionResults,
          bleepData,
        },
      }, [flatBuffer]);
    } catch (err) {
      console.error('[export] postMessage failed:', err);
      worker.terminate();
      reject(err);
    }
  });
}

// ─── Codec selection ─────────────────────────────────────────────────

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

// ─── Main export ─────────────────────────────────────────────────────

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

  const exportStart = performance.now();
  const soundEffects = getSoundEffects();

  // --- Phase 1: Collect original audio buffers + pre-compute RMS ---
  playerActions.setExportStage(`Collecting audio...`);

  const audioBuffers: AudioBuffer[] = [];
  let firstChunkFrames = 0;
  let estimatedTotalChunks = 1;

  let lastPct = -1;
  const batchedProgress = (pct: number, elapsed: string, cur: number, est: number) => {
    if (Math.abs(pct - lastPct) < 2) return;
    lastPct = pct;
    playerActions.setExportStage(
      `Collecting audio... ${elapsed}s · ${cur}/${est} chunks · ${pct}%`,
    );
  };

  const autoVolumeStarts = new Set(
    soundEffects.filter((e) => e.volumeMode === 'auto').map((e) => e.segmentStart),
  );

  const transcriptionResults = usePlayerStore.getState().transcriptionResults;
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
  let segPtrStart = 0;

  for await (const { buffer } of audioSink.buffers(0)) {
    audioBuffers.push(buffer);
    const chunkFrames = buffer.length;

    if (firstChunkFrames === 0) {
      firstChunkFrames = chunkFrames;
      const totalDuration = usePlayerStore.getState().duration;
      estimatedTotalChunks = Math.max(1, Math.ceil(totalDuration * sampleRate / chunkFrames));
    }

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

  for (let i = 0; i < autoSegs.length; i++) {
    if (segCounts[i] > 0) {
      rmsMap.set(autoSegs[i].segStart, Math.sqrt(segSums[i] / segCounts[i]));
    }
  }

  // --- Phase 2: Decode bleep sounds ---
  const elapsed2 = ((performance.now() - exportStart) / 1000).toFixed(1);
  playerActions.setExportStage(`Preparing bleep sounds... (${elapsed2}s elapsed)`);

  const decodeCtx = new OfflineAudioContext(1, 1, sampleRate);

  for (const effect of soundEffects) {
    const buf = await ensureBleepDecoded(effect.soundId, decodeCtx);
    if (!buf) {
      throw new Error(`Bleep sound "${effect.soundId}" could not be decoded`);
    }
  }
  await decodeCtx.startRendering();

  // --- Phase 3: Render censored audio via Web Worker ---
  console.log('[export] Phase 3: sending', audioBuffers.length, 'buffers to worker');
  const elapsed3 = ((performance.now() - exportStart) / 1000).toFixed(1);
  playerActions.setExportStage(
    `Rendering censored audio... 0% · ${elapsed3}s elapsed`,
  );

  const censoredBuffer = await renderCensoredAudioWorker(
    audioBuffers,
    sampleRate,
    numChannels,
    rmsMap,
    exportStart,
  );

  // Free original audio buffers — no longer needed
  audioBuffers.length = 0;

  // --- Phase 4: Choose codecs ---
  const vidCodec = await pickVideoCodec(outputFormat, originalVideoCodec);
  const audCodec = await pickAudioCodec(outputFormat, originalAudioCodec);
  const elapsed4 = ((performance.now() - exportStart) / 1000).toFixed(1);
  playerActions.setExportStage(`Codecs: ${vidCodec} + ${audCodec} (${elapsed4}s elapsed)`);

  // --- Phase 5: Convert with mediabunny ---
  lastPct = -1;
  playerActions.setExportStage(`Encoding video... 0%`);

  const format = outputFormat === 'mp4'
    ? new Mp4OutputFormat()
    : new WebMOutputFormat();

  const bufferTarget = new BufferTarget();
  const output = new Output({ format, target: bufferTarget });

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
