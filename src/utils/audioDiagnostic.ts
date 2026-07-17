import React from 'react';

// E2E диагностика — экспонируется на window для Playwright
declare global {
  interface Window {
    __audioDiagnostic: {
      concurrentSources: number;
      actuallyPlaying: number;
      peakPlayingSources: number;
      hasIterator: boolean;
      iteratorLocked: boolean;
      playbackState: string;
      getPlaybackTime: number;
      analyserPeak: number;
      analyserRms: number;
      bypassGain: number | null;
      stGain: number | null;
    };
  }
}

export interface AudioDiagnosticDeps {
  queuedAudioNodesRef: React.RefObject<Set<AudioBufferSourceNode>>;
  peakPlayingSourcesRef: React.RefObject<number>;
  audioBufferIteratorRef: React.RefObject<any | null>;
  runAudioIteratorLockRef: React.RefObject<boolean>;
  playbackStateRef: React.RefObject<string>;
  getPlaybackTime: () => number;
  analyserRef: React.RefObject<AnalyserNode | null>;
  bypassGainRef: React.RefObject<GainNode | null>;
  stGainRef: React.RefObject<GainNode | null>;
}

/**
 * Запускает интервал E2E-диагностики аудио, пишущий состояние
 * в window.__audioDiagnostic каждые 100 мс.
 * Возвращает функцию очистки.
 */
export function startAudioDiagnostic(deps: AudioDiagnosticDeps): () => void {
  const {
    queuedAudioNodesRef,
    peakPlayingSourcesRef,
    audioBufferIteratorRef,
    runAudioIteratorLockRef,
    playbackStateRef,
    getPlaybackTime,
    analyserRef,
    bypassGainRef,
    stGainRef,
  } = deps;

  const id = setInterval(() => {
    let playing = 0;
    for (const node of queuedAudioNodesRef.current) {
      if (node.playbackState === 'started') playing++;
    }
    // Track peak: monotonically increasing maximum of concurrently playing sources
    if (playing > peakPlayingSourcesRef.current) {
      peakPlayingSourcesRef.current = playing;
    }

    // Читаем данные анализатора для e2e тестов
    let analyserPeak = 0;
    let analyserRms = 0;
    if (analyserRef.current) {
      const dataArray = new Float32Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getFloatTimeDomainData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const abs = Math.abs(dataArray[i]);
        if (abs > analyserPeak) analyserPeak = abs;
        sum += dataArray[i] * dataArray[i];
      }
      analyserRms = Math.sqrt(sum / dataArray.length);
    }

    window.__audioDiagnostic = {
      concurrentSources: queuedAudioNodesRef.current.size,
      actuallyPlaying: playing,
      peakPlayingSources: peakPlayingSourcesRef.current,
      hasIterator: !!audioBufferIteratorRef.current,
      iteratorLocked: runAudioIteratorLockRef.current,
      playbackState: playbackStateRef.current,
      // Expose getPlaybackTime so e2e tests can read precise media time
      // without going through throttled DOM updates.
      getPlaybackTime: getPlaybackTime(),
      // Expose analyser data for audio quality checks
      analyserPeak,
      analyserRms,
      // Expose gain routing to detect dual-path overlap
      bypassGain: bypassGainRef.current?.gain.value ?? null,
      stGain: stGainRef.current?.gain.value ?? null,
    };
  }, 100);

  return () => clearInterval(id);
}
