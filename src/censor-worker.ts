/**
 * Web Worker for rendering censored audio.
 * Runs OfflineAudioContext + effect scheduling off the main thread
 * so the rAF video loop isn't blocked.
 *
 * Protocol:
 *   Main → Worker: { type: 'RENDER', payload: { audioChunks, sampleRate, numChannels, rmsMap, exportStartTs, soundEffects, transcriptionResults, bleepData } }
 *   Worker → Main: { type: 'RENDER_READY', payload: censoredBuffer }
 *                  { type: 'PROGRESS', payload: { done, total, pct } }
 *                  { type: 'ERROR', payload: message }
 */

interface BleepData {
  soundId: string;
  dataUrl: string | null;
  url: string | null;
}

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'RENDER') {
    renderCensored(
      payload.audioChunks,
      payload.sampleRate,
      payload.numChannels,
      payload.rmsMap,
      payload.exportStartTs,
      payload.soundEffects,
      payload.transcriptionResults,
      payload.bleepData,
    );
  }
};

/**
 * Decode a bleep sound from dataUrl or url.
 */
async function decodeBleep(
  bleep: BleepData,
  ctx: OfflineAudioContext,
): Promise<AudioBuffer | null> {
  if (bleep.dataUrl) {
    try {
      const resp = await fetch(bleep.dataUrl);
      const arrayBuffer = await resp.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    } catch {
      /* fall through */
    }
  }
  if (bleep.url) {
    try {
      const resp = await fetch(bleep.url);
      const arrayBuffer = await resp.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function renderCensored(
  audioChunks: AudioBuffer[],
  sampleRate: number,
  numChannels: number,
  rmsMapData: number[][],
  exportStartTs: number,
  soundEffects: unknown[],
  transcriptionResults: [number, number, string][],
  bleepDataMap: BleepData[],
) {
  try {
    const totalFrames = audioChunks.reduce((sum, buf) => sum + buf.length, 0);
    const totalDuration = totalFrames / sampleRate;
    const rmsMap = new Map(rmsMapData);

    const ctx = new OfflineAudioContext(numChannels, totalFrames, sampleRate);

    // Gain node for dampening
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    gainNode.connect(ctx.destination);

    // Apply dampening
    for (const effect of soundEffects) {
      if (!effect || (effect as any).effectType !== 'sound') continue;
      const e = effect as any;
      if (!e.dampenOriginal) continue;

      const seg = transcriptionResults.find(
        ([s]: number) => Math.abs(s - e.segmentStart) < 0.01,
      );
      if (!seg) continue;
      const [start, end] = seg;
      const dampenedGain = 1 - e.dampenAmount;

      if (e.dampenType === 'sharp') {
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

    // Build a map of soundId → BleepData for quick lookup
    const bleepMap = new Map<string, BleepData>();
    for (const bd of bleepDataMap) {
      bleepMap.set(bd.soundId, bd);
    }

    // Schedule bleep sounds
    let bleepScheduled = 0;
    for (const effect of soundEffects) {
      if (!effect || (effect as any).effectType !== 'sound') continue;
      const e = effect as any;

      const seg = transcriptionResults.find(
        ([s]: number) => Math.abs(s - e.segmentStart) < 0.01,
      );
      if (!seg) continue;

      const bd = bleepMap.get(e.soundId);
      if (!bd) continue;

      const bleepBuffer = await decodeBleep(bd, ctx);
      if (!bleepBuffer) continue;

      const bleepSource = ctx.createBufferSource();
      bleepSource.buffer = bleepBuffer;
      bleepSource.playbackRate.value = e.playbackRate;
      const bleepGain = ctx.createGain();

      const bleepVolume = e.volumeMode === 'auto'
        ? Math.min(1, (rmsMap.get(e.segmentStart) ?? 0.2) / 0.2)
        : e.volume;
      bleepGain.gain.value = bleepVolume ** 2;
      bleepSource.connect(bleepGain);
      bleepGain.connect(ctx.destination);
      bleepSource.start(e.segmentStart);
      bleepScheduled++;
    }

    // Progress callback
    let lastRenderPct = -2;
    ctx.onrenderprogress = () => {
      const done = ctx.currentTime;
      const pct = Math.round((done / totalDuration) * 100);
      if (Math.abs(pct - lastRenderPct) < 2) return;
      lastRenderPct = pct;
      self.postMessage({
        type: 'PROGRESS',
        payload: { done, total: totalDuration, pct },
      });
    };

    const result = await ctx.startRendering();
    ctx.onrenderprogress = null;

    // Transfer the result back to main thread
    self.postMessage(
      { type: 'RENDER_READY', payload: result },
      [result],
    );
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      payload: err instanceof Error ? err.message : String(err),
    });
  }
}
