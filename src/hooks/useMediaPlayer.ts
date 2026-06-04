import { useCallback, useRef, useEffect } from 'react';
import { usePlayerStore, playerActions } from '../store/playerStore';
import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  CanvasSink,
  Input,
  InputAudioTrack,
  UrlSource,
  WrappedAudioBuffer,
  WrappedCanvas,
} from 'mediabunny';
import { audioBuffersToWav } from '../audio';

/**
 * Хук для управления воспроизведением медиафайлов через MediaBunny.
 *
 * rAF-цикл работает всегда (как в оригинале MediaBunny) — никогда не останавливается.
 * Все функции хранятся в refs — полностью независимы от React-рендера.
 */
export function useMediaPlayer() {
  // === Refs для хранения состояния воспроизведения ===
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const inputRef = useRef<Input | null>(null);
  const videoTrackRef = useRef<InputAudioTrack | null>(null);
  const audioTrackRef = useRef<InputAudioTrack | null>(null);
  const videoSinkRef = useRef<CanvasSink | null>(null);
  const audioSinkRef = useRef<AudioBufferSink | null>(null);

  const audioContextStartTimeRef = useRef<number | null>(null);
  const playbackTimeAtStartRef = useRef<number>(0);
  const videoFrameIteratorRef = useRef<AsyncGenerator<WrappedCanvas, void, unknown> | null>(null);
  const audioBufferIteratorRef = useRef<AsyncGenerator<WrappedAudioBuffer, void, unknown> | null>(null);
  const nextFrameRef = useRef<WrappedCanvas | null>(null);
  const queuedAudioNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const asyncIdRef = useRef<number>(0);
  const playingRef = useRef<boolean>(false); // local, not from store — как в оригинале
  const playLoopRef = useRef<number>(0);
  const lastTranscribeFocusRef = useRef<number>(0);
  const lastProgressBarUpdateRef = useRef<number>(0);

  const canvasCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const domCacheRef = useRef<{
    currentTimeEl: HTMLElement | null;
    durationEl: HTMLElement | null;
    progressFill: HTMLElement | null;
    progressThumb: HTMLElement | null;
  }>({ currentTimeEl: null, durationEl: null, progressFill: null, progressThumb: null });

  // AudioContext создаётся при загрузке файла с правильной sampleRate,
 // не на маунте — как в оригинале MediaBunny

  // === Утилиты через ref — стабильные, не зависят от React ===
  const utilsRef = useRef({
    getPlaybackTime: (): number => {
      if (playingRef.current && audioContextRef.current && audioContextStartTimeRef.current != null) {
        return (
          audioContextRef.current.currentTime -
          audioContextStartTimeRef.current +
          playbackTimeAtStartRef.current
        );
      }
      return playbackTimeAtStartRef.current;
    },

    formatSeconds: (seconds: number): string => {
      const showMilliseconds = window.innerWidth >= 640;
      seconds = Math.round(seconds * 1000) / 1000;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = Math.floor(seconds % 60);
      const millisecs = Math.floor((1000 * seconds) % 1000)
        .toString()
        .padStart(3, '0');

      let result: string;
      if (hours > 0) {
        result =
          `${hours}:${minutes.toString().padStart(2, '0')}` +
          `:${remainingSeconds.toString().padStart(2, '0')}`;
      } else {
        result = `${minutes.toString().padStart(2, '0')}:${remainingSeconds
          .toString()
          .padStart(2, '0')}`;
      }

      if (showMilliseconds) {
        result += `.${millisecs}`;
      }

      return result;
    },

    drawFrame: (frame: WrappedCanvas) => {
      if (!canvasRef.current || !canvasCtxRef.current) return;
      const ctx = canvasCtxRef.current;
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(frame.canvas, 0, 0);
    },

    updateProgressBarTime: (seconds: number) => {
      const now = performance.now();
      if (now - lastProgressBarUpdateRef.current < 100) return;
      lastProgressBarUpdateRef.current = now;

      const cache = domCacheRef.current;
      if (!cache.currentTimeEl) cache.currentTimeEl = document.querySelector('[data-testid="current-time"]') as HTMLElement | null;
      if (!cache.durationEl) cache.durationEl = document.querySelector('[data-testid="duration"]') as HTMLElement | null;
      if (!cache.progressFill) cache.progressFill = document.querySelector('[data-testid="progress-fill"]') as HTMLElement | null;
      if (!cache.progressThumb) cache.progressThumb = document.querySelector('[data-testid="progress-thumb"]') as HTMLElement | null;

      if (cache.currentTimeEl) {
        cache.currentTimeEl.textContent = utilsRef.current.formatSeconds(seconds);
      }
      if (cache.progressFill && cache.durationEl) {
        const dur = Number(cache.durationEl.dataset.seconds) || 0;
        const pct = dur > 0 ? Math.max(0, Math.min(100, (seconds / dur) * 100)) : 0;
        cache.progressFill.style.width = `${pct}%`;
        cache.progressThumb.style.left = `${pct}%`;
      }
    },
  });

  // === updateNextFrame — как в оригинале, без мютекса ===
  const updateNextFrameRef = useRef(async () => {
    const currentAsyncId = asyncIdRef.current;

    while (true) {
      const iterator = videoFrameIteratorRef.current;
      if (!iterator) break;

      const newNextFrame = (await iterator.next()).value ?? null;
      if (!newNextFrame) break;

      if (currentAsyncId !== asyncIdRef.current) break;

      const playbackTime = utilsRef.current.getPlaybackTime();
      if (newNextFrame.timestamp <= playbackTime) {
        utilsRef.current.drawFrame(newNextFrame);
      } else {
        nextFrameRef.current = newNextFrame;
        break;
      }
    }
  });

  // === startVideoIterator ===
  const startVideoIteratorRef = useRef(async () => {
    if (!videoSinkRef.current) return;

    asyncIdRef.current++;
    await videoFrameIteratorRef.current?.return();

    videoFrameIteratorRef.current = videoSinkRef.current.canvases(utilsRef.current.getPlaybackTime());

    const firstFrame = (await videoFrameIteratorRef.current.next()).value ?? null;
    const secondFrame = (await videoFrameIteratorRef.current.next()).value ?? null;

    nextFrameRef.current = secondFrame;

    if (firstFrame) {
      utilsRef.current.drawFrame(firstFrame);
    }
  });

  // === pause ===
  const pauseRef = useRef(() => {
    const currentTime = utilsRef.current.getPlaybackTime();
    playbackTimeAtStartRef.current = currentTime;
    playerActions.setCurrentTime(currentTime);
    playingRef.current = false;
    playerActions.setIsPlaying(false);

    void audioBufferIteratorRef.current?.return();
    audioBufferIteratorRef.current = null;

    for (const node of queuedAudioNodesRef.current) {
      node.stop();
    }
    queuedAudioNodesRef.current.clear();

    // НЕ останавливаем rAF-цикл — как в оригинале MediaBunny
  });

  // === rAF-цикл — работает ВСЕГДА, никогда не останавливается ===
  useEffect(() => {
    const renderLoop = () => {
      const state = usePlayerStore.getState();

      if (state.fileName) {
        const playbackTime = utilsRef.current.getPlaybackTime();

        if (playbackTime >= state.duration) {
          pauseRef.current();
          playbackTimeAtStartRef.current = state.duration;
        }

        if (nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
          utilsRef.current.drawFrame(nextFrameRef.current);
          nextFrameRef.current = null;
          void updateNextFrameRef.current();
        }

        utilsRef.current.updateProgressBarTime(playbackTime);
      }

      playLoopRef.current = requestAnimationFrame(renderLoop);
    };

    playLoopRef.current = requestAnimationFrame(renderLoop);

    // Also call render on an interval to keep updating even if the tab isn't visible
    // (as in the original MediaBunny example)
    const fallbackInterval = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.fileName) {
        const playbackTime = utilsRef.current.getPlaybackTime();
        if (nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
          utilsRef.current.drawFrame(nextFrameRef.current);
          nextFrameRef.current = null;
          void updateNextFrameRef.current();
        }
        utilsRef.current.updateProgressBarTime(playbackTime);
      }
    }, 500);

    return () => {
      if (playLoopRef.current) {
        cancelAnimationFrame(playLoopRef.current);
        playLoopRef.current = 0;
      }
      clearInterval(fallbackInterval);
    };
  }, []);

  // === Транскрипция — отдельный setInterval, не конкурирует с rAF ===
  const transcribeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTranscribeFocus = useCallback(() => {
    stopTranscribeFocus();
    transcribeIntervalRef.current = setInterval(() => {
      const state = usePlayerStore.getState();
      if (state.transcriptionResults) {
        const playbackTime = utilsRef.current.getPlaybackTime();
        const currentIndex = state.transcriptionResults.findIndex(
          ([start, end]) => playbackTime >= start && playbackTime <= end
        );

        if (currentIndex === -1) return;

        const prevActive = document.querySelectorAll('tr.active-playing');
        prevActive.forEach((row) => {
          const index = row.getAttribute('data-index');
          if (index && Number(index) !== currentIndex) {
            row.classList.remove('active-playing');
          }
        });

        const activeRow = document.querySelector(`tr[data-index="${currentIndex}"]`);
        if (activeRow) {
          activeRow.classList.add('active-playing');
          activeRow.scrollIntoView({ block: 'nearest' });
        }
      }
    }, 100);
  }, []);

  const stopTranscribeFocus = useCallback(() => {
    if (transcribeIntervalRef.current) {
      clearInterval(transcribeIntervalRef.current);
      transcribeIntervalRef.current = null;
    }
  }, []);

  // === Публичные методы ===

  const stopRenderLoop = useCallback(() => {
    if (playLoopRef.current) {
      cancelAnimationFrame(playLoopRef.current);
      playLoopRef.current = 0;
    }
  }, []);

  const pause = useCallback(() => {
    pauseRef.current();
  }, []);

  const startRenderLoop = useCallback(() => {
    // rAF работает всегда, так что это no-op
  }, []);

  const runAudioIterator = useCallback(async () => {
    if (!audioBufferIteratorRef.current || !audioContextRef.current || !gainNodeRef.current) return;

    const ctx = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    const contextStart = audioContextStartTimeRef.current!;
    const playbackOffset = playbackTimeAtStartRef.current;

    try {
      for await (const wrapped of audioBufferIteratorRef.current) {
        const source = ctx.createBufferSource();
        source.buffer = wrapped.buffer;
        source.connect(gainNode);

        const bufferStart = wrapped.timestamp;
        let startTimestamp = contextStart + (bufferStart - playbackOffset);

        // Round to sample boundaries to prevent subsample audio glitches
        startTimestamp = Math.round(ctx.sampleRate * startTimestamp) / ctx.sampleRate;

        // Two cases: audio starts in the future or in the past
        if (startTimestamp >= ctx.currentTime) {
          source.start(startTimestamp);
        } else {
          source.start(ctx.currentTime, ctx.currentTime - startTimestamp);
        }

        queuedAudioNodesRef.current.add(source);
        source.onended = () => queuedAudioNodesRef.current.delete(source);

        // Slow down if we're more than a second ahead
        if (bufferStart - utilsRef.current.getPlaybackTime() >= 1) {
          await new Promise((resolve) => {
            const id = setInterval(() => {
              if (bufferStart - utilsRef.current.getPlaybackTime() < 1) {
                clearInterval(id);
                resolve();
              }
            }, 100);
          });
        }
      }
    } catch {
      // Итератор остановлен (pause) — нормально
    }
  }, []);

  const play = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        playerActions.setError('Audio system not available');
        return;
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const currentDuration = usePlayerStore.getState().duration;
      if (utilsRef.current.getPlaybackTime() === currentDuration) {
        playbackTimeAtStartRef.current = 0;
        await startVideoIteratorRef.current();
      }

      audioContextStartTimeRef.current = audioContextRef.current.currentTime;
      playingRef.current = true;
      playerActions.setIsPlaying(true);

      if (audioSinkRef.current) {
        audioBufferIteratorRef.current = audioSinkRef.current.buffers(utilsRef.current.getPlaybackTime());
        void runAudioIterator();
      }

      startTranscribeFocus();
    } catch (error) {
      console.error('Playback error:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Playback failed');
    }
  }, [audioSinkRef, runAudioIterator, startTranscribeFocus]);

  const togglePlay = useCallback(() => {
    const isPlaying = usePlayerStore.getState().isPlaying;
    if (isPlaying) {
      pause();
    } else {
      void play();
    }
  }, [pause, play]);

  const seekToTime = useCallback(async (seconds: number) => {
    const wasPlaying = usePlayerStore.getState().isPlaying;

    if (wasPlaying) {
      pause();
    }

    playbackTimeAtStartRef.current = seconds;
    playerActions.setCurrentTime(seconds);

    await startVideoIteratorRef.current();

    if (wasPlaying) {
      await play();
    }
  }, [pause, play]);

  const setVolume = useCallback((volume: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume ** 2;
    }
    playerActions.setVolume(volume);
  }, []);

  const toggleMute = useCallback(() => {
    if (!gainNodeRef.current) return;
    const currentVolume = usePlayerStore.getState().volume;
    const muted = currentVolume === 0;
    const targetVolume = muted ? 0.7 : 0;
    gainNodeRef.current.gain.value = targetVolume ** 2;
    playerActions.setIsMuted(muted);
    if (muted) playerActions.setVolume(0.7);
  }, []);

  const initMediaPlayer = useCallback(async (resource: File | string) => {
    try {
      const isCurrentlyPlaying = usePlayerStore.getState().isPlaying;
      if (isCurrentlyPlaying) {
        pause();
      }

      // Close old audio context if any (sampleRate may differ for new file)
      if (audioContextRef.current) {
        await audioContextRef.current.close();
        audioContextRef.current = null;
        gainNodeRef.current = null;
      }

      playerActions.setError(null);
      playerActions.setWarning(null);
      playerActions.setFileName(resource instanceof File ? resource.name : resource);

      const source =
        resource instanceof File ? new BlobSource(resource) : new UrlSource(resource);
      const input = new Input({ source, formats: ALL_FORMATS });
      inputRef.current = input;

      playbackTimeAtStartRef.current = 0;
      const totalDuration = await input.computeDuration();
      playerActions.setDuration(totalDuration);

      let videoTrack = await input.getPrimaryVideoTrack();
      let audioTrack = await input.getPrimaryAudioTrack();

      let problemMessage = '';

      if (videoTrack) {
        if (videoTrack.codec === null) {
          problemMessage += 'Unsupported video codec. ';
          videoTrack = null;
        } else if (!(await videoTrack.canDecode())) {
          problemMessage += 'Unable to decode the video track. ';
          videoTrack = null;
        }
      }

      if (audioTrack) {
        if (audioTrack.codec === null) {
          problemMessage += 'Unsupported audio codec. ';
          audioTrack = null;
        } else if (!(await audioTrack.canDecode())) {
          problemMessage += 'Unable to decode the audio track. ';
          audioTrack = null;
        }
      }

      if (!videoTrack && !audioTrack) {
        if (!problemMessage) {
          problemMessage = 'No audio or video track found.';
        }
        throw new Error(problemMessage);
      }

      if (problemMessage) {
        playerActions.setWarning(problemMessage);
      }

      // Create AudioContext with matching sampleRate — КРИТИЧНО для правильного звука!
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (audioTrack) {
        const sampleRate = audioTrack.sampleRate;
        audioContextRef.current = new AudioContextClass({ sampleRate });
        gainNodeRef.current = audioContextRef.current.createGain();
        gainNodeRef.current.connect(audioContextRef.current.destination);
        playerActions.setVolume(0.7);
      } else {
        // No audio — create context for timing only
        audioContextRef.current = new AudioContextClass();
      }

      const videoCanBeTransparent = videoTrack
        ? await videoTrack.canBeTransparent()
        : false;

      videoSinkRef.current =
        videoTrack &&
        new CanvasSink(videoTrack, {
          poolSize: 2,
          fit: 'contain',
          alpha: videoCanBeTransparent,
        });

      audioSinkRef.current = audioTrack && new AudioBufferSink(audioTrack);

      videoTrackRef.current = videoTrack;
      audioTrackRef.current = audioTrack;

      if (canvasRef.current && videoTrack) {
        canvasRef.current.width = videoTrack.displayWidth;
        canvasRef.current.height = videoTrack.displayHeight;
        canvasCtxRef.current = canvasRef.current.getContext('2d');
      }

      await startVideoIteratorRef.current();

      if (audioContextRef.current?.state === 'running') {
        await play();
      }
    } catch (error) {
      console.error('Error initializing media player:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Failed to load media');
    }
  }, [pause, play]);

  const transcribe = useCallback(async () => {
    if (!audioSinkRef.current || !audioTrackRef.current) {
      playerActions.setError('No audio track available for transcription');
      return;
    }

    try {
      const chunks: AudioBuffer[] = [];
      for await (const { buffer } of audioSinkRef.current.buffers(0)) {
        chunks.push(buffer);
      }

      const fileName = usePlayerStore.getState().fileName;
      const audioBlob = audioBuffersToWav(chunks, audioTrackRef.current.sampleRate);
      const formData = new FormData();
      formData.append('file', audioBlob, `${fileName}.wav`);

      const response = await fetch('http://localhost:8686/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }

      const { task_id } = await response.json();

      const socket = new WebSocket(`ws://localhost:8686/ws/status/${task_id}`);

      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.status === 'PROCESSING') {
          // Обновить состояние кнопки
        } else if (msg.status === 'DONE') {
          playerActions.setTranscriptionResults(msg.results);
          socket.close();
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        playerActions.setError('Failed to connect to transcription server');
        socket.close();
      };
    } catch (error) {
      console.error('Transcription error:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Transcription failed');
    }
  }, [audioSinkRef, audioTrackRef]);

  const cleanup = useCallback(() => {
    stopRenderLoop();
    stopTranscribeFocus();
    void audioBufferIteratorRef.current?.return();
    audioBufferIteratorRef.current = null;

    for (const node of queuedAudioNodesRef.current) {
      node.stop();
    }
    queuedAudioNodesRef.current.clear();

    void videoFrameIteratorRef.current?.return();
    videoFrameIteratorRef.current = null;

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [stopRenderLoop, stopTranscribeFocus]);

  const getPlaybackTime = useCallback(() => utilsRef.current.getPlaybackTime(), []);
  const formatSeconds = useCallback((s: number) => utilsRef.current.formatSeconds(s), []);

  const render = useCallback(() => {
    // no-op — rAF работает всегда
  }, []);

  return {
    canvasRef,
    playerContainerRef,
    initMediaPlayer,
    play,
    pause,
    togglePlay,
    seekToTime,
    setVolume,
    toggleMute,
    transcribe,
    getPlaybackTime,
    formatSeconds,
    render,
    startRenderLoop,
    stopRenderLoop,
    cleanup,
    getVideoSink: () => videoSinkRef.current,
    getAudioSink: () => audioSinkRef.current,
    getAudioTrack: () => audioTrackRef.current,
  };
}
