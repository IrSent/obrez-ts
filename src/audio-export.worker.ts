/**
 * Web Worker for censored audio rendering.
 * Receives a single flat ArrayBuffer (planar layout) + chunkLengths from the main thread,
 * reconstructs AudioBuffers, applies effects via OfflineAudioContext, and returns
 * the final censored AudioBuffer.
 *
 * Protocol:
 *   Main → Worker: { type: 'RENDER', payload: { flatBuffer, chunkLengths, sampleRate, numChannels, rmsMapData, soundEffects, transcriptionResults, bleepData } }
 *   Worker → Main: { type: 'RENDER_READY', payload: censoredBuffer }
 *                  { type: 'PROGRESS', payload: { done, total, pct } }
 *                  { type: 'ERROR', payload: message }
 */

interface BleepData {
  soundId: string;
  dataUrl: string | null;
  url: string | null;
}

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

type TranscriptionSegment = [number, number, string];

interface RenderPayload {
  flatBuffer: ArrayBuffer;
  chunkLengths: number[];
  sampleRate: number;
  numChannels: number;
  rmsMapData: [number, number][];
  soundEffects: SoundEffect[];
  transcriptionResults: TranscriptionSegment[];
  bleepData: BleepData[];
}

interface ProgressMessage {
  type: 'PROGRESS';
  payload: { done: number; total: number; pct: number };
}

interface RenderReadyMessage {
  type: 'RENDER_READY';
  payload: AudioBuffer;
}

interface ErrorMessage {
  type: 'ERROR';
  payload: string;
}

type WorkerMessage = ProgressMessage | RenderReadyMessage | ErrorMessage;

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data as { type: string; payload: RenderPayload };

  console.log('[audio-export-worker] onmessage, type:', type);

  if (type === 'RENDER') {
    console.log('[audio-export-worker] RENDER received, flatBuffer size:', payload.flatBuffer?.byteLength);
    renderCensored(payload);
  }
};

async function renderCensored(data: RenderPayload) {
  const { flatBuffer, chunkLengths, sampleRate, numChannels, rmsMapData, soundEffects, transcriptionResults, bleepData } = data;

  // Reconstruct AudioBuffers from the flat ArrayBuffer (planar layout).
  // Channel 0: frames 0..N-1, Channel 1: frames N..2N-1, etc.
  const dummyCtx = new OfflineAudioContext(1, 1, sampleRate);
  const audioChunks: AudioBuffer[] = [];

  let frameOffset = 0;
  for (const chunkLen of chunkLengths) {
    const buf = dummyCtx.createBuffer(numChannels, chunkLen, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      const srcOffset = frameOffset + ch * chunkLen;
      const src = new Float32Array(flatBuffer, srcOffset * 4, chunkLen);
      buf.copyToChannel(src, ch);
    }
    audioChunks.push(buf);
    frameOffset += chunkLen;
  }
  dummyCtx.close();

  try {
    const totalFrames = audioChunks.reduce((sum, buf) => sum + buf.length, 0);
    const totalDuration = totalFrames / sampleRate;

    const rmsMap = new Map<number, number>(rmsMapData);

    const ctx = new OfflineAudioContext(numChannels, totalFrames, sampleRate);

    // Gain node for dampening
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    gainNode.connect(ctx.destination);

    // Dampening
    applyDampening(gainNode, soundEffects, transcriptionResults);

    // Play audio chunks through gain node
    let cumulativeTime = 0;
    for (const chunk of audioChunks) {
      const source = ctx.createBufferSource();
      source.buffer = chunk;
      source.connect(gainNode);
      source.start(cumulativeTime);
      cumulativeTime += chunk.length / sampleRate;
    }

    // Bleep sounds
    await applyBleepSounds(ctx, soundEffects, transcriptionResults, bleepData, rmsMap);

    // Render progress
    let lastRenderPct = -2;
    ctx.onrenderprogress = () => {
      const done = ctx.currentTime;
      const pct = Math.round((done / totalDuration) * 100);
      if (Math.abs(pct - lastRenderPct) < 2) return;
      lastRenderPct = pct;
      postMessage<ProgressMessage>({
        type: 'PROGRESS',
        payload: { done, total: totalDuration, pct },
      });
    };

    const result = await ctx.startRendering();
    ctx.onrenderprogress = null;

    // Transfer result back
    postMessage<RenderReadyMessage>(
      { type: 'RENDER_READY', payload: result },
      [result],
    );
  } catch (err) {
    postMessage<ErrorMessage>({
      type: 'ERROR',
      payload: err instanceof Error ? err.message : String(err),
    });
  }
}

function applyDampening(
  gainNode: GainNode,
  soundEffects: SoundEffect[],
  transcriptionResults: TranscriptionSegment[],
): void {
  for (const effect of soundEffects) {
    if (effect.effectType !== 'sound' || !effect.dampenOriginal) continue;

    const seg = transcriptionResults.find(
      ([s]) => Math.abs(s - effect.segmentStart) < 0.01,
    );
    if (!seg) continue;

    const [start, end] = seg;
    const dampenedGain = 1 - (effect.dampenAmount ?? 1);

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
}

async function applyBleepSounds(
  ctx: OfflineAudioContext,
  soundEffects: SoundEffect[],
  transcriptionResults: TranscriptionSegment[],
  bleepData: BleepData[],
  rmsMap: Map<number, number>,
): Promise<void> {
  const bleepMap = new Map<string, BleepData>();
  for (const bd of bleepData) {
    bleepMap.set(bd.soundId, bd);
  }

  const promises: Promise<void>[] = [];

  for (const effect of soundEffects) {
    if (effect.effectType !== 'sound') continue;

    const seg = transcriptionResults.find(
      ([s]) => Math.abs(s - effect.segmentStart) < 0.01,
    );
    if (!seg) continue;

    const bd = bleepMap.get(effect.soundId);
    if (!bd) continue;

    promises.push(decodeAndScheduleBleep(ctx, bd, effect, rmsMap));
  }

  await Promise.all(promises);
}

async function decodeAndScheduleBleep(
  ctx: OfflineAudioContext,
  bd: BleepData,
  effect: SoundEffect,
  rmsMap: Map<number, number>,
): Promise<void> {
  let bleepBuffer: AudioBuffer | null = null;

  if (bd.dataUrl) {
    try {
      const resp = await fetch(bd.dataUrl);
      const arr = await resp.arrayBuffer();
      bleepBuffer = await ctx.decodeAudioData(arr);
    } catch { /* skip */ }
  }

  if (!bleepBuffer && bd.url) {
    try {
      const resp = await fetch(bd.url);
      const arr = await resp.arrayBuffer();
      bleepBuffer = await ctx.decodeAudioData(arr);
    } catch { /* skip */ }
  }

  if (!bleepBuffer) return;

  const bleepSource = ctx.createBufferSource();
  bleepSource.buffer = bleepBuffer;
  bleepSource.playbackRate.value = effect.playbackRate ?? 1;

  const bleepGain = ctx.createGain();
  const bleepVolume = effect.volumeMode === 'auto'
    ? Math.min(1, (rmsMap.get(effect.segmentStart) ?? 0.2) / 0.2)
    : (effect.volume ?? 1);
  bleepGain.gain.value = bleepVolume ** 2;

  bleepSource.connect(bleepGain);
  bleepGain.connect(ctx.destination);
  bleepSource.start(effect.segmentStart);
}
