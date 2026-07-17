import { usePlayerStore } from '../store/playerStore';

/**
 * Запускает мониторинг артефактов вывода: клиппинг, клики, рипы,
 * «песок» (sand), блубы. Проверка каждые 50 мс.
 * Возвращает функцию очистки.
 */
export function startAudioMonitor(analyser: AnalyserNode, sampleRate: number): () => void {
  const dataArray = new Float32Array(analyser.frequencyBinCount);
  const freqData = new Uint8Array(analyser.frequencyBinCount);

  // HF energy ratio: bins covering 4-8 kHz (sand lives there)
  const binWidth = sampleRate / analyser.fftSize;
  const hfStart = Math.floor(4000 / binWidth);
  const hfEnd = Math.floor(8000 / binWidth);

  let clickCount = 0; // clicks in last 500ms window
  let clipCount = 0;  // clips in last 500ms window
  // Reset counters every 500ms so "3 in 500ms" is accurate
  const resetId = setInterval(() => { clickCount = 0; clipCount = 0; }, 500);

  const monitorInterval = setInterval(() => {
    const speed = usePlayerStore.getState().playbackSpeed;

    // ── Time-domain analysis ──
    analyser.getFloatTimeDomainData(dataArray);
    const peak = Math.max(...dataArray);
    if (peak >= 0.99) {
      clipCount++;
      if (clipCount >= 3) {
        console.warn(`[output-clip] ${clipCount} in 500ms peak=${peak.toFixed(3)} speed=${speed}x`);
        clipCount = 0;
      }
    }

    // Click detection: sudden jumps between consecutive samples
    // (indicates buffer-boundary discontinuities / phase vocoder clicks).
    // Thresholds are high — normal speech plosives (/p/, /t/, /k/)
    // produce deltas > 0.3. Only flag if a significant fraction of
    // the waveform is discontinuous.
    let microClicks = 0; // 0.35-0.5 = subtle clicks
    let hardClicks = 0;  // > 0.5 = hard clicks
    for (let i = 1; i < dataArray.length; i++) {
      const delta = Math.abs(dataArray[i] - dataArray[i - 1]);
      if (delta > 0.5) hardClicks++;
      else if (delta > 0.35) microClicks++;
    }
    // Flag only if >1% of transitions are clicks — speech has <0.1%.
    const totalPairs = dataArray.length - 1;
    if (hardClicks >= totalPairs * 0.01 || microClicks >= totalPairs * 0.02) {
      console.warn(`[output-click] hard=${hardClicks} micro=${microClicks} speed=${speed}x`);
    }

    // Rip detection: HF bursts (4-8kHz) that are loud and short
    analyser.getByteFrequencyData(freqData);
    let totalEnergy = 0;
    for (let i = 1; i < freqData.length; i++) totalEnergy += freqData[i] * freqData[i];
    if (totalEnergy < 10000) return; // too quiet, skip

    let hfEnergy = 0;
    for (let i = hfStart; i < hfEnd && i < freqData.length; i++) {
      hfEnergy += freqData[i] * freqData[i];
    }
    const hfRatio = hfEnergy / totalEnergy;

    // HF burst = rip artifact (not sand — sand is sustained HF).
    // 0.40 threshold — normal speech sibilance (/s/, /ш/) lives at 4-8kHz.
    // Values 0.35-0.39 are common in speech and not artifacts.
    if (hfRatio > 0.4 && speed > 1) {
      console.warn(`[output-rip] hfRatio=${hfRatio.toFixed(2)} speed=${speed}x`);
    }

    // Mid-range (1-4kHz): phase vocoder boundary artifacts live here.
    // Phase vocoder can create periodic ripples at the
    // overlap boundary — detectable as sustained mid-range energy.
    const midStart = Math.floor(1000 / binWidth);
    const midEnd = Math.floor(4000 / binWidth);
    let midEnergy = 0;
    for (let i = midStart; i < midEnd && i < freqData.length; i++) {
      midEnergy += freqData[i] * freqData[i];
    }
    const midRatio = midEnergy / totalEnergy;

    // Normal speech: midRatio ~0.3-0.4. Phase vocoder artifacts push it >0.55.
    if (midRatio > 0.55 && speed > 1) {
      console.warn(`[output-rip-mid] midRatio=${midRatio.toFixed(2)} speed=${speed}x`);
    }

    // Rate-of-change: sudden HF energy shifts between consecutive measurements
    // indicate phase vocoder boundary artifacts (ripping). Store previous hfRatio.
    if ((analyser as any)._prevHfRatio != null) {
      const hfDelta = Math.abs(hfRatio - (analyser as any)._prevHfRatio);
      if (hfDelta > 0.15 && speed > 1) {
        console.warn(`[output-hf-jump] hfDelta=${hfDelta.toFixed(2)} prev=${(analyser as any)._prevHfRatio.toFixed(2)} now=${hfRatio.toFixed(2)} speed=${speed}x`);
      }
    }
    (analyser as any)._prevHfRatio = hfRatio;

    // Blub detection: LF energy spike (80-300Hz dominant)
    const lfStart = Math.floor(80 / binWidth);
    const lfEnd = Math.floor(300 / binWidth);
    let lfEnergy = 0;
    for (let i = lfStart; i < lfEnd && i < freqData.length; i++) {
      lfEnergy += freqData[i] * freqData[i];
    }
    const lfRatio = lfEnergy / totalEnergy;
    if (lfRatio > 0.6 && speed > 1) {
      console.warn(`[output-blub] lfRatio=${lfRatio.toFixed(2)} speed=${speed}x`);
    }

    // Spectral flatness (higher = more noise-like = sand)
    let logSum = 0;
    let linSum = 0;
    for (let i = 1; i < freqData.length; i++) {
      const v = freqData[i] + 1;
      logSum += Math.log(v);
      linSum += v;
    }
    const flatness = Math.exp(logSum / (freqData.length - 1)) / (linSum / (freqData.length - 1));

    if (hfRatio > 0.35 && flatness > 0.6 && speed > 1) {
      console.warn(
        `[sand] hfRatio=${hfRatio.toFixed(2)} flatness=${flatness.toFixed(2)} speed=${speed}x`
      );
    }
  }, 50);

  return () => {
    clearInterval(monitorInterval);
    clearInterval(resetId);
  };
}
