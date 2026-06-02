import { useCallback, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
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
 * Синхронизирует состояние с Zustand-стором.
 */
export function useMediaPlayer() {
  const store = usePlayerStore();
  const { actions } = store;

  // Refs для хранения состояния воспроизведения
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const inputRef = useRef<Input | null>(null);
  const videoTrackRef = useRef<InputAudioTrack | null>(null);
  const audioTrackRef = useRef<InputAudioTrack | null>(null);
  const videoSinkRef = useRef<CanvasSink | null>(null);
  const audioSinkRef = useRef<AudioBufferSink | null>(null);

  // Refs для состояния воспроизведения
  const audioContextStartTimeRef = useRef<number | null>(null);
  const playbackTimeAtStartRef = useRef<number>(0);
  const videoFrameIteratorRef = useRef<AsyncGenerator<WrappedCanvas, void, unknown> | null>(null);
  const audioBufferIteratorRef = useRef<AsyncGenerator<WrappedAudioBuffer, void, unknown> | null>(null);
  const nextFrameRef = useRef<WrappedCanvas | null>(null);
  const queuedAudioNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const asyncIdRef = useRef<number>(0);
  const playLoopRef = useRef<number>(0);

  // Инициализация AudioContext
  const initAudioContext = useCallback(() => {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass();
    gainNodeRef.current = audioContextRef.current.createGain();
    gainNodeRef.current.connect(audioContextRef.current.destination);
    actions.setVolume(0.7);
  }, [actions]);

  // Инициализация при первом вызове
  initAudioContext();

  /**
   * Возвращает текущее время воспроизведения в секундах.
   */
  const getPlaybackTime = useCallback((): number => {
    if (store.isPlaying) {
      return (
        audioContextRef.current!.currentTime -
        audioContextStartTimeRef.current! +
        playbackTimeAtStartRef.current
      );
    }
    return playbackTimeAtStartRef.current;
  }, [store.isPlaying]);

  /**
   * Форматирует секунды в строку времени.
   */
  const formatSeconds = useCallback((seconds: number): string => {
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
  }, []);

  /**
   * Обновляет прогресс-бар и время.
   */
  const updateProgressBarTime = useCallback((seconds: number) => {
    actions.setCurrentTime(seconds);
  }, [actions]);

  /**
   * Создаёт новый итератор кадров видео и отображает первый кадр.
   */
  const startVideoIterator = useCallback(async () => {
    if (!videoSinkRef.current) return;

    asyncIdRef.current++;

    await videoFrameIteratorRef.current?.return();

    videoFrameIteratorRef.current = videoSinkRef.current.canvases(getPlaybackTime());

    const firstFrame = (await videoFrameIteratorRef.current.next()).value ?? null;
    const secondFrame = (await videoFrameIteratorRef.current.next()).value ?? null;

    nextFrameRef.current = secondFrame;

    if (firstFrame && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')!;
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      ctx.drawImage(firstFrame.canvas, 0, 0);
    }
  }, [getPlaybackTime]);

  /**
   * Обновляет следующий кадр видео.
   */
  const updateNextFrame = useCallback(async () => {
    const currentAsyncId = asyncIdRef.current;

    while (true) {
      const newNextFrame = (await videoFrameIteratorRef.current!.next()).value ?? null;
      if (!newNextFrame) break;

      if (currentAsyncId !== asyncIdRef.current) break;

      const playbackTime = getPlaybackTime();
      if (newNextFrame.timestamp <= playbackTime) {
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(newNextFrame.canvas, 0, 0);
        }
      } else {
        nextFrameRef.current = newNextFrame;
        break;
      }
    }
  }, [getPlaybackTime]);

  /**
   * Обновляет подсветку активной строки транскрипции.
   */
  const updateTranscribeFocus = useCallback((playbackTime: number) => {
    if (store.transcriptionResults) {
      const currentIndex = store.transcriptionResults.findIndex(
        ([start, end]) => playbackTime >= start && playbackTime <= end
      );

      if (currentIndex !== -1) {
        const activeRow = document.querySelector(`tr[data-index="${currentIndex}"]`);
        if (activeRow) {
          activeRow.classList.add('active-playing');
          activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }

      // Снимаем старую подсветку
      document.querySelectorAll('tr.active-playing').forEach((row) => {
        if (!row.classList.contains('active-playing')) return;
        const index = row.getAttribute('data-index');
        if (index && Number(index) !== currentIndex) {
          row.classList.remove('active-playing');
        }
      });
    }
  }, [store.transcriptionResults]);

  /**
   * Основной цикл рендеринга видео.
   */
  const render = useCallback((requestFrame = true) => {
    if (store.fileName) {
      const playbackTime = getPlaybackTime();

      if (store.transcriptionResults) {
        updateTranscribeFocus(playbackTime);
      }

      if (playbackTime >= store.duration) {
        pause();
        playbackTimeAtStartRef.current = store.duration;
      }

      if (nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d')!;
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(nextFrameRef.current.canvas, 0, 0);
        }
        nextFrameRef.current = null;
        void updateNextFrame();
      }

      updateProgressBarTime(playbackTime);
    }

    if (requestFrame) {
      playLoopRef.current = requestAnimationFrame(() => render());
    }
  }, [
    store.fileName,
    store.duration,
    store.transcriptionResults,
    getPlaybackTime,
    updateTranscribeFocus,
    updateNextFrame,
    updateProgressBarTime,
  ]);

  /**
   * Запускает цикл рендеринга.
   */
  const startRenderLoop = useCallback(() => {
    render();
  }, [render]);

  /**
   * Останавливает цикл рендеринга.
   */
  const stopRenderLoop = useCallback(() => {
    if (playLoopRef.current) {
      cancelAnimationFrame(playLoopRef.current);
      playLoopRef.current = 0;
    }
  }, []);

  /**
   * Запускает воспроизведение.
   */
  const play = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        actions.setError('Audio system not available');
        return;
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      if (getPlaybackTime() === store.duration) {
        playbackTimeAtStartRef.current = 0;
        await startVideoIterator();
      }

      audioContextStartTimeRef.current = audioContextRef.current.currentTime;
      actions.setIsPlaying(true);

      if (audioSinkRef.current) {
        audioBufferIteratorRef.current = audioSinkRef.current.buffers(getPlaybackTime());
        void runAudioIterator();
      }

      startRenderLoop();
    } catch (error) {
      console.error('Playback error:', error);
      actions.setError(error instanceof Error ? error.message : 'Playback failed');
    }
  }, [
    audioSinkRef,
    actions,
    getPlaybackTime,
    store.duration,
    startVideoIterator,
    startRenderLoop,
  ]);

  /**
   * Останавливает воспроизведение.
   */
  const pause = useCallback(() => {
    actions.setIsPlaying(false);
    playbackTimeAtStartRef.current = getPlaybackTime();
    void audioBufferIteratorRef.current?.return();
    audioBufferIteratorRef.current = null;

    for (const node of queuedAudioNodesRef.current) {
      node.stop();
    }
    queuedAudioNodesRef.current.clear();

    stopRenderLoop();
  }, [actions, getPlaybackTime, stopRenderLoop]);

  /**
   * Переключает воспроизведение/паузу.
   */
  const togglePlay = useCallback(() => {
    if (store.isPlaying) {
      pause();
    } else {
      void play();
    }
  }, [store.isPlaying, pause, play]);

  /**
   * Перемотка к указанному времени.
   */
  const seekToTime = useCallback(async (seconds: number) => {
    const wasPlaying = store.isPlaying;

    if (wasPlaying) {
      pause();
    }

    playbackTimeAtStartRef.current = seconds;
    actions.setCurrentTime(seconds);

    await startVideoIterator();

    if (wasPlaying) {
      await play();
    }
  }, [store.isPlaying, pause, play, startVideoIterator, actions]);

  /**
   * Устанавливает громкость.
   */
  const setVolume = useCallback((volume: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume ** 2;
    }
    actions.setVolume(volume);
  }, [actions]);

  /**
   * Переключает режим mute/unmute.
   */
  const toggleMute = useCallback(() => {
    if (!gainNodeRef.current) return;
    const currentVolume = gainNodeRef.current.gain.value;
    const muted = currentVolume === 0;
    gainNodeRef.current.gain.value = muted ? 0.7 : 0;
    actions.setIsMuted(muted);
  }, [actions]);

  /**
   * Инициализирует медиаплеер с указанным ресурсом.
   */
  const initMediaPlayer = useCallback(async (resource: File | string) => {
    try {
      if (store.isPlaying) {
        pause();
      }

      actions.setError(null);
      actions.setWarning(null);
      actions.setFileName(resource instanceof File ? resource.name : resource);

      const source =
        resource instanceof File ? new BlobSource(resource) : new UrlSource(resource);
      const input = new Input({ source, formats: ALL_FORMATS });
      inputRef.current = input;

      playbackTimeAtStartRef.current = 0;
      const totalDuration = await input.computeDuration();
      actions.setDuration(totalDuration);

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
        actions.setWarning(problemMessage);
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
      }

      await startVideoIterator();

      if (audioContextRef.current?.state === 'running') {
        await play();
      }

      startRenderLoop();
    } catch (error) {
      console.error('Error initializing media player:', error);
      actions.setError(error instanceof Error ? error.message : 'Failed to load media');
    }
  }, [
    store.isPlaying,
    pause,
    actions,
    startVideoIterator,
    play,
    startRenderLoop,
  ]);

  /**
   * Собирает все аудио-чанки и отправляет на сервер для транскрипции.
   */
  const transcribe = useCallback(async () => {
    if (!audioSinkRef.current || !audioTrackRef.current) {
      actions.setError('No audio track available for transcription');
      return;
    }

    try {
      const chunks: AudioBuffer[] = [];
      for await (const { buffer } of audioSinkRef.current.buffers(0)) {
        chunks.push(buffer);
      }

      const audioBlob = audioBuffersToWav(chunks, audioTrackRef.current.sampleRate);
      const formData = new FormData();
      formData.append('file', audioBlob, `${store.fileName}.wav`);

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
          actions.setTranscriptionResults(msg.results);
          socket.close();
        }
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        actions.setError('Failed to connect to transcription server');
        socket.close();
      };
    } catch (error) {
      console.error('Transcription error:', error);
      actions.setError(error instanceof Error ? error.message : 'Transcription failed');
    }
  }, [audioSinkRef, audioTrackRef, store.fileName, actions]);

  // Cleanup при размонтировании
  const cleanup = useCallback(() => {
    stopRenderLoop();
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
  }, [stopRenderLoop]);

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
