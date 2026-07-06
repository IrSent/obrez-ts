// src/censor-worker.ts
self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === "RENDER") {
    renderCensored(payload.audioChunks, payload.sampleRate, payload.numChannels, payload.rmsMap, payload.exportStartTs, payload.soundEffects, payload.transcriptionResults, payload.bleepData);
  }
};
async function decodeBleep(bleep, ctx) {
  if (bleep.dataUrl) {
    try {
      const resp = await fetch(bleep.dataUrl);
      const arrayBuffer = await resp.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    } catch {}
  }
  if (bleep.url) {
    try {
      const resp = await fetch(bleep.url);
      const arrayBuffer = await resp.arrayBuffer();
      return ctx.decodeAudioData(arrayBuffer);
    } catch {}
  }
  return null;
}
async function renderCensored(audioChunks, sampleRate, numChannels, rmsMapData, exportStartTs, soundEffects, transcriptionResults, bleepDataMap) {
  try {
    const totalFrames = audioChunks.reduce((sum, buf) => sum + buf.length, 0);
    const totalDuration = totalFrames / sampleRate;
    const rmsMap = new Map(rmsMapData);
    const ctx = new OfflineAudioContext(numChannels, totalFrames, sampleRate);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    gainNode.connect(ctx.destination);
    for (const effect of soundEffects) {
      if (!effect || effect.effectType !== "sound")
        continue;
      const e = effect;
      if (!e.dampenOriginal)
        continue;
      const seg = transcriptionResults.find(([s]) => Math.abs(s - e.segmentStart) < 0.01);
      if (!seg)
        continue;
      const [start, end] = seg;
      const dampenedGain = 1 - e.dampenAmount;
      if (e.dampenType === "sharp") {
        gainNode.gain.setValueAtTime(dampenedGain, start);
        gainNode.gain.setValueAtTime(1, end);
      } else {
        const tau = (end - start) * 0.3;
        gainNode.gain.setValueAtTime(dampenedGain, start);
        gainNode.gain.setTargetAtTime(1, start + tau, tau);
        gainNode.gain.setValueAtTime(1, end);
      }
    }
    let cumulativeTime = 0;
    for (const chunk of audioChunks) {
      const source = ctx.createBufferSource();
      source.buffer = chunk;
      source.connect(gainNode);
      source.start(cumulativeTime);
      cumulativeTime += chunk.length / sampleRate;
    }
    const bleepMap = new Map;
    for (const bd of bleepDataMap) {
      bleepMap.set(bd.soundId, bd);
    }
    let bleepScheduled = 0;
    for (const effect of soundEffects) {
      if (!effect || effect.effectType !== "sound")
        continue;
      const e = effect;
      const seg = transcriptionResults.find(([s]) => Math.abs(s - e.segmentStart) < 0.01);
      if (!seg)
        continue;
      const bd = bleepMap.get(e.soundId);
      if (!bd)
        continue;
      const bleepBuffer = await decodeBleep(bd, ctx);
      if (!bleepBuffer)
        continue;
      const bleepSource = ctx.createBufferSource();
      bleepSource.buffer = bleepBuffer;
      bleepSource.playbackRate.value = e.playbackRate;
      const bleepGain = ctx.createGain();
      const bleepVolume = e.volumeMode === "auto" ? Math.min(1, (rmsMap.get(e.segmentStart) ?? 0.2) / 0.2) : e.volume;
      bleepGain.gain.value = bleepVolume ** 2;
      bleepSource.connect(bleepGain);
      bleepGain.connect(ctx.destination);
      bleepSource.start(e.segmentStart);
      bleepScheduled++;
    }
    let lastRenderPct = -2;
    ctx.onrenderprogress = () => {
      const done = ctx.currentTime;
      const pct = Math.round(done / totalDuration * 100);
      if (Math.abs(pct - lastRenderPct) < 2)
        return;
      lastRenderPct = pct;
      self.postMessage({
        type: "PROGRESS",
        payload: { done, total: totalDuration, pct }
      });
    };
    const result = await ctx.startRendering();
    ctx.onrenderprogress = null;
    self.postMessage({ type: "RENDER_READY", payload: result }, [result]);
  } catch (err) {
    self.postMessage({
      type: "ERROR",
      payload: err instanceof Error ? err.message : String(err)
    });
  }
}

//# debugId=C3D144F38042511764756E2164756E21
