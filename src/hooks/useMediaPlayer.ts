import { useCallback, useRef, useEffect } from 'react';
import { usePlayerStore, playerActions } from '../store/playerStore';
import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  CanvasSink,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  Input,
  InputAudioTrack,
  Mp4OutputFormat,
  Output,
  BufferTarget,
  UrlSource,
  WrappedAudioBuffer,
  WrappedCanvas,
} from 'mediabunny';
import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import { audioBuffersToWav } from '../audio';
import { backendPath, backendWsPath } from '../config';

/**
 * Хук для управления воспроизведением медиафайлов через MediaBunny.
 *
 * rAF-цикл работает всегда (как в оригинале MediaBunny) — никогда не останавливается.
 * Все функции хранятся в refs — полностью независимы от React-рендера.
 *
 * Architecture: a single transitionTo(newState) is the ONLY entry point for
 * changing playback state.  It atomically:
 *   1) stops the current audio iterator (if any)
 *   2) waits for all AudioContext nodes to truly silence
 *   3) starts a new audio iterator (if newState === 'playing')
 * This prevents any possibility of two concurrent iterators / jumbled audio.
 */
export function useMediaPlayer() {
  // === Refs для хранения состояния воспроизведения ===
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const stNodeRef = useRef<SoundTouchNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bypassGainRef = useRef<GainNode | null>(null);
  const stGainRef = useRef<GainNode | null>(null);
  const inputRef = useRef<Input | null>(null);
  const resourceRef = useRef<File | string | null>(null);
  const videoTrackRef = useRef<InputAudioTrack | null>(null);
  const audioTrackRef = useRef<InputAudioTrack | null>(null);
  const videoSinkRef = useRef<CanvasSink | null>(null);
  const audioSinkRef = useRef<AudioBufferSink | null>(null);

  const audioContextStartTimeRef = useRef<number | null>(null);
  const playbackTimeAtStartRef = useRef<number>(0);
  const playbackSpeedRef = useRef<number>(1); // mirrors store, used in hot loops
  const sampleRateRef = useRef<number>(48000); // actual AudioContext sampleRate
  const videoFrameIteratorRef = useRef<AsyncGenerator<WrappedCanvas, void, unknown> | null>(null);
  const audioBufferIteratorRef = useRef<AsyncGenerator<WrappedAudioBuffer, void, unknown> | null>(null);
  const nextFrameRef = useRef<WrappedCanvas | null>(null);
  const queuedAudioNodesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const asyncIdRef = useRef<number>(0);
  const lastBufferEndRef = useRef<number>(0); // track gap between buffers

  // === Playback state machine ===
  // "idle" | "playing" | "pausing" | "paused" — only one transition at a time.
  const playbackStateRef = useRef<string>('idle');

  // Sound effect engine
  const triggeredEffectsRef = useRef<Set<string>>(new Set());
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
      const speed = playbackSpeedRef.current;
      if (playbackStateRef.current === 'playing' && audioContextRef.current && audioContextStartTimeRef.current != null) {
        return (audioContextRef.current.currentTime - audioContextStartTimeRef.current) * speed + playbackTimeAtStartRef.current;
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

  // === Sound effect engine ===

 // Subscribe to playbackSpeed changes.
  //
  // SoundTouchNode is a pitch compensator:
  //   source.playbackRate = speed → accelerates audio (chipmunk)
  //   stNode.playbackRate = speed → compensates pitch back to normal
  // Net effect: speed-up without chipmunk.
  //
  // Speed-dependent SoundTouch stretch parameters.
  //
  // CRITICAL: outputPerWindow = seekWindowLength - overlapLength MUST be divisible by 128
  // (render quantum size). Otherwise each Stretch cycle produces 1 underrun → steady-state
  // crackle. seq=72, ovl=32 → 3456-1536=1920, 1920/128=15 ✓.
  //
  // overlapMs=32 at >1x for audio quality (longer crossfade → less sand/graininess).
  // overlapMs=24 at ≤1x (lower speeds have different sampleReq — keep conservative).
  //
  // sampleReq = 4416 constant for ALL speeds >= 1x (seq=72, seek=20, ovl=32 at 48kHz):
  //   overlapLength=1536, intskip = round(1920/speed)
  //   intskip + 1536 <= 3456 = seekWindowLength (at 1x: 1920+1536=3456)
  //   → max(seekWindowLength, intskip+overlapLength) = 3456
  //   → sampleReq = 3456 + 960 = 4416
  function speedStretchParams(s: number): { sequenceMs: number; seekWindowMs: number; overlapMs: number; quickSeek: boolean } {
    if (s > 1.0) return { sequenceMs: 72, seekWindowMs: 20, overlapMs: 32, quickSeek: false };  // quality overlap
    if (s === 1.0) return { sequenceMs: 72, seekWindowMs: 20, overlapMs: 24, quickSeek: false };   // divisibility
    return { sequenceMs: 50, seekWindowMs: 20, overlapMs: 24, quickSeek: false };                     // below 1x
  }

  // Lock: only one speed transition at a time. If the user clicks fast,
  // only the final speed (from playbackSpeedRef) is applied.
  const speedTransitionRef = useRef<boolean>(false);

  // Resolved when SoundTouch FIFO has enough samples for quality audio.
  // Set at the start of startAudio(), resolved by the metrics handler,
  // and awaited before video/playback state is started.
  const audioReadyResolveRef = useRef<(() => void) | null>(null);

  // Prev underrun count ref — shared between metrics handler and speed
  // transition so we can reset it on speed change and avoid carry-over.
  const prevUnderrunsRef = useRef<number>(0);
  // Live underrun count from the latest metrics event.
  const liveUnderrunCountRef = useRef<number>(0);

 const speedUnsub = usePlayerStore.subscribe(
    async (state, prevState) => {
      const speed = state.playbackSpeed;
      const prevSpeed = prevState.playbackSpeed;
      if (speed !== prevSpeed && !speedTransitionRef.current) {
        speedTransitionRef.current = true;
        try {
          // 1. Save current media time
          const currentMediaT = utilsRef.current.getPlaybackTime();
          const wasPlaying = playbackStateRef.current === 'playing';

          const stNode = stNodeRef.current;
          const ctx = audioContextRef.current;
          const now = ctx?.currentTime ?? 0;

          // 2. Set new speed on SoundTouch FIRST — before any nodes stop,
          // so SoundTouch processes at the new rate from the start.
          playbackSpeedRef.current = speed;
          if (stNode) {
            const newParams = speedStretchParams(speed);
            const oldParams = speedStretchParams(prevSpeed);
            if (
              newParams.sequenceMs !== oldParams.sequenceMs ||
              newParams.seekWindowMs !== oldParams.seekWindowMs ||
              newParams.overlapMs !== oldParams.overlapMs
            ) {
              stNode.setStretchParameters(newParams);
            }
            stNode.playbackRate.setValueAtTime(speed, now);
          }

          // 3. Bridge silence: start feeding SoundTouch at the new speed
          // BEFORE stopping old audio. This ensures the FIFO never drains.
          if (wasPlaying && stNode && ctx && speed > 1) {
            const bridgeMs = 1000;
            const bridgeSamples = Math.ceil(ctx.sampleRate * bridgeMs / 1000);
            const bridgeBuffer = ctx.createBuffer(2, bridgeSamples, ctx.sampleRate);
            const bridgeSource = ctx.createBufferSource();
            bridgeSource.buffer = bridgeBuffer;
            bridgeSource.playbackRate.setValueAtTime(speed, now);
            bridgeSource.connect(stNode);
            bridgeSource.start(now);
            console.log(`[audio] bridge silence: ${bridgeSamples} samples (${bridgeMs}ms at ${speed}x)`);
          }

        // 4. Stop all audio — bridge keeps SoundTouch fed.
          await stopAudio();

          // 5. Reset underrun counter so carry-over from 1x (where
          // underruns accumulate silently with stGain=0) doesn't inflate
          // the first delta at the new speed.
          prevUnderrunsRef.current = liveUnderrunCountRef.current;

          // 6. Resume from the saved position at the new speed
          if (wasPlaying && audioSinkRef.current) {
            playbackTimeAtStartRef.current = currentMediaT;

            // Start audio and wait for SoundTouch FIFO to be ready.
            // At 1x this returns immediately (SoundTouch is bypassed).
            await startAudio();

            // Restart video iterator from the saved position.
            // Time is frozen (state='paused') — no frames are drawn yet.
            await startVideoIteratorRef.current();

            // Now audio is ready and video is positioned — start playback.
            playbackStateRef.current = 'playing';
            playerActions.setIsPlaying(true);
          } else {
            playbackStateRef.current = 'paused';
          }
        } finally {
          speedTransitionRef.current = false;
        }
      }
    },
  );

  /**
   * Trigger a sound effect: play the bleep sound and optionally dampen
   * the original audio for the duration of the segment.
   */
  function triggerSoundEffect(
    effect: import('../types').SoundCensoringEffect,
    segmentEnd: number,
  ): void {
    const ctx = audioContextRef.current;
    const gainNode = gainNodeRef.current;
    if (!ctx || !gainNode) return;

    const sound = usePlayerStore.getState().bleepSounds[effect.soundId];
    if (!sound || !sound.audioBuffer) return;

    const now = ctx.currentTime;

    // Play the bleep sound at the configured volume and rate
    const source = ctx.createBufferSource();
    source.buffer = sound.audioBuffer;
    source.playbackRate.value = effect.playbackRate;

    const volGain = ctx.createGain();
    volGain.gain.value = effect.volume ** 2; // perceptual scaling
    source.connect(volGain);
    volGain.connect(ctx.destination);
    source.start(now);
    queuedAudioNodesRef.current.add(source);
    source.onended = () => queuedAudioNodesRef.current.delete(source);

    // Dampen original audio for the full segment duration,
    // independent of the bleep sound's playback rate.
    if (effect.dampenOriginal) {
      const currentGain = gainNode.gain.value;
      const dampenedGain = currentGain * (1 - effect.dampenAmount);
      // Convert media-time segment duration to wall-clock duration
      const spd = usePlayerStore.getState().playbackSpeed;
      const segmentDuration = (segmentEnd - effect.segmentStart) / spd;

      if (effect.dampenType === 'sharp') {
        // Immediate drop, hold, immediate restore at segment end
        gainNode.gain.setValueAtTime(dampenedGain, now);
        gainNode.gain.setValueAtTime(currentGain, now + segmentDuration);
      } else {
        // Parabolic: smooth dip and restore using setTargetAtTime
        const tau = segmentDuration * 0.3;
        gainNode.gain.setValueAtTime(dampenedGain, now);
        gainNode.gain.setTargetAtTime(currentGain, now + tau, tau);
        // Force-restore at segment end to avoid lingering drift
        gainNode.gain.setValueAtTime(currentGain, now + segmentDuration);
      }
    }
  }

  /**
   * Check playback time against sound effects and trigger any that haven't
   * fired yet for the current play session.
   */
  function checkSoundEffects(playbackTime: number): void {
    const { censoringEffects, transcriptionResults, censoringMode } = usePlayerStore.getState();
    if (!censoringMode || !censoringEffects || !transcriptionResults) return;

    for (const e of censoringEffects) {
      if (e.effectType !== 'sound') continue;
      if (triggeredEffectsRef.current.has(e.id)) continue;

      // Find the segment end time from transcription results
      const seg = transcriptionResults.find(
        ([s]) => Math.abs(s - e.segmentStart) < 0.01,
      );
      if (!seg) continue;

      const [start, end] = seg;
      if (playbackTime >= start && playbackTime < end) {
        triggeredEffectsRef.current.add(e.id);
        triggerSoundEffect(e, end);
      }
    }
  }

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

  // =====================================================================
  //  STOP-AUDIO — the only place that tears down audio nodes.
  //  Returns a Promise that resolves when all nodes are truly silent.
  // =====================================================================
  const stopAudio = async () => {
    // CRITICAL: read current time BEFORE changing playbackStateRef.
    // getPlaybackTime() returns frozen time when state !== 'playing',
    // so setting 'pausing' first would cause us to read stale time.
    const ctx = audioContextRef.current;
    const currentTime = ctx && audioContextStartTimeRef.current != null
      ? (ctx.currentTime - audioContextStartTimeRef.current) * playbackSpeedRef.current + playbackTimeAtStartRef.current
      : playbackTimeAtStartRef.current;

    playbackTimeAtStartRef.current = currentTime;
    playbackStateRef.current = 'pausing';

    playerActions.setCurrentTime(currentTime);
    playerActions.setIsPlaying(false);

    // Abort the audio iterator — fire-and-forget. Awaiting return() blocks
    // until the MediaBunny decoder finishes its current cycle, during which
    // SoundTouch FIFO drains and produces underruns. Returning without await
    // lets the bridge silence keep SoundTouch fed while the decoder cleans up.
    if (audioBufferIteratorRef.current) {
      void audioBufferIteratorRef.current.return();
      audioBufferIteratorRef.current = null;
    }

    // Release the lock so a new runAudioIterator can start after this stop.
    runAudioIteratorLockRef.current = false;

    // Stop all queued nodes and wait for the audio thread to silence them.
    if (ctx && ctx.state !== 'closed' && queuedAudioNodesRef.current.size > 0) {
      const stopAt = ctx.currentTime + 0.005;
      for (const node of queuedAudioNodesRef.current) {
        node.stop(stopAt);
      }
      queuedAudioNodesRef.current.clear();
      // Wait until the audio clock passes stopAt — the audio thread
      // stops nodes at this exact moment.
      const margin = 0.005;
      while (ctx.currentTime < stopAt + margin) {
        await new Promise(r => setTimeout(r, 6));
      }
    }

    // Reset triggered effects so they can fire again on next play.
    triggeredEffectsRef.current.clear();

    playbackStateRef.current = 'paused';
  };

  // =====================================================================
  //  START-AUDIO — the only place that creates the audio iterator.
  //  Must NOT be called while an iterator is already running.
  //
  //  At >1x: starts the audio iterator (bootstrap silence → SoundTouch),
  //  then waits for SoundTouch FIFO to fill (via metrics event). Video
  //  and 'playing' state are only started after audio is ready.
  //  At 1x: returns immediately (SoundTouch is bypassed, no FIFO to fill).
  // =====================================================================
  const startAudio = async () => {
    if (!audioSinkRef.current || !audioContextRef.current) return;
    if (audioBufferIteratorRef.current) return; // already running

    const ctx = audioContextRef.current;
    const speed = playbackSpeedRef.current;

    // Ensure gain routing matches current speed.
    if (bypassGainRef.current && stGainRef.current) {
      bypassGainRef.current.gain.setValueAtTime(speed === 1 ? 1 : 0, ctx.currentTime);
      stGainRef.current.gain.setValueAtTime(speed === 1 ? 0 : 1, ctx.currentTime);
    }

    // Start the audio iterator — it feeds bootstrap silence into SoundTouch.
    audioContextStartTimeRef.current = ctx.currentTime;
    lastBufferEndRef.current = 0;
    audioBufferIteratorRef.current = audioSinkRef.current.buffers(utilsRef.current.getPlaybackTime());
    void runAudioIteratorRef.current?.();

    // Wait for bootstrap silence to warm up SoundTouch before proceeding.
    // At 1x, SoundTouch is bypassed (stGain=0) — no wait needed.
    // We listen for the metrics signal (framesBuffered >= 8832) rather than
    // relying on a fixed timeout — the FIFO is ready when it's ready.
    if (speed > 1) {
      const startTime = Date.now();
      audioReadyResolveRef.current = () => {}; // no-op placeholder
      // The metrics handler (set up in runAudioIterator) will resolve this
      // when framesBuffered >= 2 * sampleReq (8832 at 48kHz).
      await new Promise<void>((resolve) => {
        audioReadyResolveRef.current = resolve;
        // Safety fallback: if metrics never fire, proceed after 2s.
        setTimeout(() => {
          if (audioReadyResolveRef.current === resolve) {
            console.warn('[audio] bootstrap timeout — FIFO not full, proceeding anyway');
            audioReadyResolveRef.current = null;
            resolve();
          }
        }, 2000);
      });
      const waited = Date.now() - startTime;
      console.log(`[audio] bootstrap wait done (${waited}ms), proceeding with playback`);
    }
  };

  // =====================================================================
  //  TRANSITION — the single entry point for all playback state changes.
  //  target: 'playing' | 'paused'
  //  seekTo: optional media-time to jump to before playing.
  // =====================================================================
  const transitionRef = useRef<
    (target: 'playing' | 'paused', seekTo?: number) => Promise<void>
  >(async (target, seekTo) => {
    // If a transition is already in progress, no-op.
    if (playbackStateRef.current === 'pausing') return;

    // If already in the target state AND not seeking, no-op.
    if (seekTo == null && target === 'playing' && playbackStateRef.current === 'playing') return;
    if (seekTo == null && target === 'paused' && playbackStateRef.current === 'paused') return;

    // Stop current audio if playing.
    if (playbackStateRef.current === 'playing') {
      await stopAudio();
    }

    // If seeking, update position and video iterator.
    if (seekTo != null) {
      playbackTimeAtStartRef.current = seekTo;
      playerActions.setCurrentTime(seekTo);
      playerActions.setIsEnded(false);
      triggeredEffectsRef.current.clear();
      await startVideoIteratorRef.current();
    }

    // Start audio if target is playing.
    if (target === 'playing') {
      if (audioContextRef.current?.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      // startAudio() waits for SoundTouch FIFO to be ready at >1x.
      // After it resolves, audio is quality — safe to start video + time.
      await startAudio();
      playbackStateRef.current = 'playing';
      playerActions.setIsPlaying(true);
    } else {
      playbackStateRef.current = 'paused';
    }
  });

  // === rAF-цикл — работает ВСЕГДА, никогда не останавливается ===
  useEffect(() => {
    const renderLoop = () => {
      const state = usePlayerStore.getState();

      if (state.fileName) {
        const playbackTime = utilsRef.current.getPlaybackTime();

        if (state.duration > 0 && playbackTime >= state.duration) {
          // End of playback — transition to paused.
          void transitionRef.current('paused');
          playbackTimeAtStartRef.current = state.duration;
          playerActions.setIsEnded(true);
        }

        if (nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
          utilsRef.current.drawFrame(nextFrameRef.current);
          nextFrameRef.current = null;
          void updateNextFrameRef.current();
        }

        utilsRef.current.updateProgressBarTime(playbackTime);

        // Check and trigger sound effects
        checkSoundEffects(playbackTime);
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
        checkSoundEffects(playbackTime);
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

  const pause = useCallback(async () => {
    await transitionRef.current('paused');
  }, []);

  const startRenderLoop = useCallback(() => {
    // rAF работает всегда, так что это no-op
  }, []);

  /**
   * Audio playback iterator — uses SoundTouchNode for pitch-preserving time-stretch.
   *
   * source.playbackRate = speed → faster audio stream (chipmunk)
   * stNode.playbackRate = speed → SoundTouch compensates pitch back to normal
   * Net effect: speed-up without chipmunk.
   *
   * Kaiser interpolation (beta=8.6) + generous overlap-add parameters
   * (sequenceMs=72, seekWindowMs=20, overlapMs=24) for audio quality.
   */
  const runAudioIteratorRef = useRef<(() => Promise<void>) | null>(null);
  const runAudioIteratorLockRef = useRef<boolean>(false);
  runAudioIteratorRef.current = async () => {
    if (runAudioIteratorLockRef.current) {
      console.warn('[audio] runAudioIterator skipped — already running');
      return;
    }
    runAudioIteratorLockRef.current = true;
    try {
      if (!audioBufferIteratorRef.current || !audioContextRef.current || !stNodeRef.current) return;

      const ctx = audioContextRef.current;
      const stNode = stNodeRef.current;
      const speed = playbackSpeedRef.current;

   // Bootstrap: at speeds > 1x, SoundTouch Stretch needs sampleReq=4416 samples
      // to produce its first output window. Feed silence to prime the pipeline.
      // sampleReq = 4416 constant for all speeds >= 1x.
      // Scale with speed: at higher speeds the stretch engine drains the FIFO
      // faster, so we need more silence to keep it warm.
      // The bridge silence (in speed transition) feeds SoundTouch before this,
      // and the warmup (at init) pre-fills the FIFO. Bootstrap adds final headroom.
      // At 1.5x: 300*1.5=450ms of silence samples, played at 1.5x = 300ms wall-clock.
      // At 2x: 600ms samples, 300ms wall-clock.
      // At 1x: no bootstrap — bypassGain=1 means audio goes directly to output,
      // and SoundTouch is muted (stGain=0). A bootstrap would eat into the first
      // 50ms of real audio, causing the "jumbled segments" artifact at start.
      const BOOTSTRAP_MS = speed > 1 ? Math.ceil(300 * speed) : 0;

      if (BOOTSTRAP_MS > 0) {
        const bootstrapSamples = Math.ceil(ctx.sampleRate * BOOTSTRAP_MS / 1000);
        // Stereo silence to match the pipeline (both channels prime the FIFO).
        const silenceBuffer = ctx.createBuffer(2, bootstrapSamples, ctx.sampleRate);
        const silenceSource = ctx.createBufferSource();
        silenceSource.buffer = silenceBuffer;
        silenceSource.playbackRate.setValueAtTime(speed, ctx.currentTime);
        silenceSource.connect(stNode);
        // Also feed bypass path so both routes are warmed when switching.
        silenceSource.connect(bypassGainRef.current!);
        silenceSource.start(ctx.currentTime);
        queuedAudioNodesRef.current.add(silenceSource);
        silenceSource.onended = () => queuedAudioNodesRef.current.delete(silenceSource);
        console.log(`[audio] bootstrap: ${BOOTSTRAP_MS}ms at ${speed}x, wall-clock=${(BOOTSTRAP_MS/speed).toFixed(0)}ms, samples=${bootstrapSamples}`);
      }

      // lastEnd: tracks the end-time of the previously scheduled BufferSource.
      // Initialize to the end of the silence bootstrap so the first real buffer
      // chains seamlessly — no gap between silence and audio.
      // Silence plays at `speed`, so wall-clock duration = BOOTSTRAP_MS / speed.
      let lastEnd = ctx.currentTime + (BOOTSTRAP_MS / 1000) / speed;

      // Track the actual end time of each BufferSource via the 'ended' event.
      // This corrects for speed changes that occur mid-buffer — when speed
      // increases, the buffer finishes earlier than the scheduled lastEnd.
      // When speed decreases, it finishes later.
      let actualEndCorrection: number | null = null;

      for await (const wrapped of audioBufferIteratorRef.current) {
        const currentMediaT = utilsRef.current.getPlaybackTime();

        // Diagnostic: log gaps between buffers (gap → underrun → click)
        const gap = wrapped.timestamp - lastBufferEndRef.current;
        lastBufferEndRef.current = wrapped.timestamp + wrapped.buffer.duration;
        if (gap > 0.001 && gap < 5) {
          console.warn(
            `[gap] ${gap.toFixed(3)}s between buffers at mediaT=${currentMediaT.toFixed(3)}s`
          );
        }

        const currentSpeed = playbackSpeedRef.current;
        const bufferEndAtSpeed = wrapped.buffer.duration / currentSpeed;

        // Apply correction from the previous buffer's actual end time.
        // Only at >1x — at 1x the correction is unreliable (onended fires
        // before audio truly stops on the render thread) and creates micro-gaps.
        if (actualEndCorrection != null && currentSpeed > 1) {
          lastEnd = actualEndCorrection;
          actualEndCorrection = null;
        }

        // Safety: if lastEnd is in the past (speed change created a gap),
        // fill the gap with silence so SoundTouch's FIFO doesn't starve.
        // At 1x: skip the gap filler — silence through bypassGain is audible
        // as a stutter (hard boundary with real audio). Let the hardware
        // produce natural silence instead, then chain the next buffer.
        if (lastEnd < ctx.currentTime) {
          if (currentSpeed > 1) {
            const gapDur = ctx.currentTime - lastEnd;
            const gapSamples = Math.ceil(ctx.sampleRate * gapDur);
            const gapSilence = ctx.createBuffer(2, gapSamples, ctx.sampleRate);
            const gapSource = ctx.createBufferSource();
            gapSource.buffer = gapSilence;
            gapSource.playbackRate.setValueAtTime(currentSpeed, ctx.currentTime);
            gapSource.connect(stNode);
            gapSource.start(lastEnd);
            queuedAudioNodesRef.current.add(gapSource);
            gapSource.onended = () => queuedAudioNodesRef.current.delete(gapSource);
          }
          lastEnd = ctx.currentTime;
        }

        // Chain: first buffer starts after bootstrap silence, subsequent buffers
        // start exactly when the previous one ends — no gap, no overlap.
        const startTime = lastEnd !== null ? lastEnd : ctx.currentTime + BOOTSTRAP_MS / 1000;

        // Snap to sample boundary
        const snappedStart = Math.round(ctx.sampleRate * startTime) / ctx.sampleRate;

        stNode.playbackRate.setValueAtTime(currentSpeed, ctx.currentTime);
        const source = ctx.createBufferSource();
        source.buffer = wrapped.buffer;
        // Only set playbackRate if it differs from the default (1.0) to avoid
        // unnecessary automation events that can cause artifacts at 1x.
        if (currentSpeed !== 1) {
          source.playbackRate.setValueAtTime(currentSpeed, ctx.currentTime);
        }

        // Always feed SoundTouch (FIFO stays warm). Also feed bypassGain for 1x.
        source.connect(stNode);
        source.connect(bypassGainRef.current!);

        // If start time is in the past (backpressure wait), start now — no offset.
        // Offset would skip audio and create a gap. Starting now guarantees continuity.
        if (snappedStart >= ctx.currentTime) {
          source.start(snappedStart);
        } else {
          source.start(ctx.currentTime);
        }

        // Calculate expected end time (may be wrong if speed changes mid-buffer).
        const expectedEnd = snappedStart + bufferEndAtSpeed;

        queuedAudioNodesRef.current.add(source);
        // Track actual end time to correct lastEnd for the next buffer.
        // This eliminates gaps/overlaps caused by speed changes mid-buffer.
        source.onended = () => {
          queuedAudioNodesRef.current.delete(source);
          actualEndCorrection = ctx.currentTime;
        };

        // Use expected end as best estimate; actualEndCorrection will fix it.
        lastEnd = expectedEnd;

        // Backpressure: slow down to avoid scheduling too far ahead.
        // At 1x, MediaBunny can be slow — keep 4s ahead to prevent gaps.
        if (wrapped.timestamp - utilsRef.current.getPlaybackTime() >= 4) {
          await new Promise((resolve) => {
            const id = setInterval(() => {
              if (wrapped.timestamp - utilsRef.current.getPlaybackTime() < 3.5) {
                clearInterval(id);
                resolve();
              }
            }, 50);
          });
        }
      }
    } catch {
      // Итератор остановлен (pause) — нормально
    } finally {
      runAudioIteratorLockRef.current = false;
    }
  };

  const play = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        playerActions.setError('Audio system not available');
        return;
      }

      const currentDuration = usePlayerStore.getState().duration;
      if (utilsRef.current.getPlaybackTime() === currentDuration) {
        playbackTimeAtStartRef.current = 0;
        playerActions.setIsEnded(false);
        await startVideoIteratorRef.current();
      }

      await transitionRef.current('playing');
    } catch (error) {
      console.error('Playback error:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Playback failed');
    }
  }, []);

  // Keep a stable ref so the transcribe function can resume playback later
  const playRef = useRef<(() => Promise<void>) | null>(null);
  playRef.current = play;

  const togglePlay = useCallback(() => {
    const currentState = playbackStateRef.current;
    if (currentState === 'playing') {
      void pause();
    } else if (currentState === 'paused' || currentState === 'idle') {
      void play();
    }
  }, [pause, play]);

  const seekToTime = useCallback(async (seconds: number) => {
    const wasPlaying = playbackStateRef.current === 'playing';
    await transitionRef.current(wasPlaying ? 'playing' : 'paused', seconds);
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume ** 2;
    }
    playerActions.setVolume(volume);
    // Поднимаем mute, если громкость установлена > 0
    if (volume > 0) {
      playerActions.setIsMuted(false);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const state = usePlayerStore.getState();
    const currentlyMuted = state.isMuted;
    const previousVolume = state.volume;

    if (gainNodeRef.current) {
      if (currentlyMuted) {
        // Unmute: restore previous volume
        const restoreVolume = previousVolume === 0 ? 0.5 : previousVolume;
        gainNodeRef.current.gain.value = restoreVolume ** 2;
        playerActions.setVolume(restoreVolume);
      } else {
        // Mute: silence
        gainNodeRef.current.gain.value = 0;
      }
    }
    playerActions.setIsMuted(!currentlyMuted);
  }, []);

  const initMediaPlayer = useCallback(async (resource: File | string) => {
    try {
      // Stop any current playback before reinitializing.
      await stopAudio();
      playbackStateRef.current = 'idle';

      // Close old audio context if any (sampleRate may differ for new file)
      if (audioContextRef.current) {
        stNodeRef.current?.disconnect();
        await audioContextRef.current.close();
        audioContextRef.current = null;
        stNodeRef.current = null;
        gainNodeRef.current = null;
      }

      playerActions.setError(null);
      playerActions.setWarning(null);
      playerActions.setIsEnded(false);
      playerActions.setFileName(resource instanceof File ? resource.name : resource);
      playerActions.setTranscriptionResults(null);
      playerActions.setTranscribing(false);
      playerActions.setCensoringEffects([]);
      triggeredEffectsRef.current.clear();

      const source =
        resource instanceof File ? new BlobSource(resource) : new UrlSource(resource);
      const input = new Input({ source, formats: ALL_FORMATS });
      inputRef.current = input;
      resourceRef.current = resource;

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
        const sampleRate = await audioTrack.getSampleRate();
        audioContextRef.current = new AudioContextClass({ sampleRate });

        // Register and create SoundTouchNode for pitch-preserving time-stretch
        await SoundTouchNode.register(audioContextRef.current, '/soundtouch-processor.js');
        await SoundTouchNode.registerStrategyModule(audioContextRef.current, '/kaiser-strategy.js');

        stNodeRef.current = new SoundTouchNode({
          context: audioContextRef.current,
          interpolationStrategy: 'kaiser',
          sampleBufferType: 'fifo',
        });
        // Kaiser уже зарегистрирован в worklet-регистре (soundtouch-processor.js
        // экспонирует strategyRegistry как globalThis._strategyRegistry, kaiser-strategy.js
        // само-регистрируется при addModule). setInterpolationStrategy — safeguard.
        stNodeRef.current.setInterpolationStrategy('kaiser');
        // Initialize stretch params: seq=72, ovl=24 → sampleReq=4416 for ALL speeds >= 1x.
        // seq=72 ensures outputPerWindow=2304 is divisible by 128 → 0 steady-state underruns.
        stNodeRef.current.setStretchParameters(speedStretchParams(1));

        // Monitor SoundTouchNode for underruns (indicates pipeline can't keep up)
        let stReadyStreak = 0; // consecutive checks above target
        stNodeRef.current.addEventListener('metrics', (e: any) => {
          const m = e.detail;
          const delta = m.underrunCount - prevUnderrunsRef.current;
          prevUnderrunsRef.current = m.underrunCount;
          liveUnderrunCountRef.current = m.underrunCount;
          // At 1x SoundTouch is bypassed (stGain=0) — underruns are harmless
          // noise from a cold FIFO that we don't need to warn about.
          const curSpeed = usePlayerStore.getState().playbackSpeed;
          if (delta > 0 && curSpeed > 1) {
            console.warn(
              `[st-underrun] +${delta} (total=${m.underrunCount}) buffered=${m.framesBuffered} ` +
              `speed=${curSpeed}x`
            );
          }

          // Signal audio-ready when FIFO has enough samples for 2 consecutive checks.
          // Target: 500 frames ≈ 10ms at 48kHz. The warmup + bridge + bootstrap
          // already fill the FIFO significantly — we just need to confirm it's
          // not empty. 2 streaks = ~200ms of sustained buffering.
          if (audioReadyResolveRef.current && curSpeed > 1) {
            const target = 500;
            if (m.framesBuffered >= target) {
              stReadyStreak++;
              if (stReadyStreak >= 2) {
                console.log(`[audio] SoundTouch ready: buffered=${m.framesBuffered} >= ${target} (stable)`);
                const resolve = audioReadyResolveRef.current;
                audioReadyResolveRef.current = null;
                stReadyStreak = 0;
                resolve();
              }
            } else {
              stReadyStreak = 0; // reset on drop
            }
          }
        });

        // Compressor to prevent clipping at higher speeds
        compressorRef.current = audioContextRef.current.createDynamicsCompressor();
        compressorRef.current.threshold.value = -12;
        compressorRef.current.knee.value = 10;
        compressorRef.current.ratio.value = 20;
        compressorRef.current.attack.value = 0.001;
        compressorRef.current.release.value = 0.1;

        // Hard limiter as final safety net — clamps at 0dB, nothing gets through.
        const limiter = audioContextRef.current.createDynamicsCompressor();
        limiter.threshold.value = -0.5;
        limiter.knee.value = 2;
        limiter.ratio.value = 60;
        limiter.attack.value = 0.0005;
        limiter.release.value = 0.05;
        limiterRef.current = limiter;

        // Analyser for clipping + sand diagnostics — AFTER compressor/limiter
        // so we measure what actually reaches the speaker.
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 512;

        gainNodeRef.current = audioContextRef.current.createGain();

        // Bypass gain: at 1x, audio goes directly to compressor (0 underruns).
        // stGain: at >1x, audio goes through SoundTouch.
        // SoundTouch always receives audio (FIFO stays warm) for seamless transitions.
        const bypassGain = audioContextRef.current.createGain();
        bypassGain.gain.value = 1; // default: bypass at 1x
        const stGain = audioContextRef.current.createGain();
        stGain.gain.value = 0;
        bypassGainRef.current = bypassGain;
        stGainRef.current = stGain;

        // Chain:
        //   source → bypassGain → compressor
        //   source → stNode → stGain → compressor
        //   compressor → limiter → analyser → gain → destination
        bypassGain.connect(compressorRef.current);
        stNodeRef.current.connect(stGain);
        stGain.connect(compressorRef.current);
        compressorRef.current.connect(limiter);
        limiter.connect(analyserRef.current);
        analyserRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioContextRef.current.destination);
        gainNodeRef.current.gain.value = 0.5 ** 2;
        playerActions.setVolume(0.5);

        // Store refs for speed transition
        bypassGainRef.current = bypassGain;
        stGainRef.current = stGain;

  // Warmup SoundTouch FIFO: feed 3 seconds of silence at 2x
        // so the FIFO is pre-filled when the first speed change happens.
        // stGain is 0 at 1x, so the warmup silence is inaudible through SoundTouch.
        // The real audio will go through bypassGain (which is at 1).
        {
          const warmupCtx = audioContextRef.current!;
          const warmupStNode = stNodeRef.current!;
          const warmupMs = 3000;
          const warmupSamples = Math.ceil(warmupCtx.sampleRate * warmupMs / 1000);
          const warmupBuffer = warmupCtx.createBuffer(2, warmupSamples, warmupCtx.sampleRate);
          const warmupSource = warmupCtx.createBufferSource();
          warmupSource.buffer = warmupBuffer;
          warmupSource.playbackRate.setValueAtTime(2, warmupCtx.currentTime);
          warmupSource.connect(warmupStNode);
          warmupSource.start(warmupCtx.currentTime);
          // Fire-and-forget: don't block playback waiting for the FIFO to fill.
          // The warmup source plays 3s of silence at 2x (1.5s wall-clock).
          // It stops on its own via onended. By the time the first speed change
          // happens, the FIFO will be significantly pre-filled.
          warmupSource.onended = () => {
            console.log(`[audio] SoundTouch warmup done: ${warmupSamples} samples at 2x`);
          };
        }

        // Monitor for clipping + sand (every 100 ms)
        const dataArray = new Float32Array(analyserRef.current.frequencyBinCount);
        const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);

        // HF energy ratio: bins covering 4-8 kHz (sand lives there)
        const binWidth = audioContextRef.current.sampleRate / analyserRef.current.fftSize;
        const hfStart = Math.floor(4000 / binWidth);
        const hfEnd = Math.floor(8000 / binWidth);

        const monitorInterval = setInterval(() => {
          const analyser = analyserRef.current;
          if (!analyser) {
            clearInterval(monitorInterval);
            return;
          }

          // ── Clipping (time domain) ──
          analyser.getFloatTimeDomainData(dataArray);
          const peak = Math.max(...dataArray);
          if (peak >= 0.99) {
            console.warn(
              `[clipping] peak=${peak.toFixed(3)} speed=${usePlayerStore.getState().playbackSpeed}x`
            );
          }

          // ── Sand detection (frequency domain) ──
          analyser.getByteFrequencyData(freqData);

          // Total energy (skip DC bin 0)
          let totalEnergy = 0;
          for (let i = 1; i < freqData.length; i++) {
            totalEnergy += freqData[i] * freqData[i];
          }
          if (totalEnergy < 10000) return; // too quiet, skip

          // HF energy (4-8 kHz)
          let hfEnergy = 0;
          for (let i = hfStart; i < hfEnd && i < freqData.length; i++) {
            hfEnergy += freqData[i] * freqData[i];
          }
          const hfRatio = hfEnergy / totalEnergy;

          // Spectral flatness (higher = more noise-like = more sand)
          let logSum = 0;
          let linSum = 0;
          for (let i = 1; i < freqData.length; i++) {
            const v = freqData[i] + 1; // +1 to avoid log(0)
            logSum += Math.log(v);
            linSum += v;
          }
          const flatness = Math.exp(logSum / (freqData.length - 1)) / (linSum / (freqData.length - 1));

          // Both indicators trigger → sand likely
          if (hfRatio > 0.35 && flatness > 0.6) {
            console.warn(
              `[sand] hfRatio=${hfRatio.toFixed(2)} flatness=${flatness.toFixed(2)} ` +
              `speed=${usePlayerStore.getState().playbackSpeed}x`
            );
          }
        }, 100);

        // Store interval id on the analyser for cleanup later
        (analyserRef.current as any)._clipInterval = monitorInterval;
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

      // Auto-play on init: wait for audio to be ready (SoundTouch FIFO),
      // then start video, then set playing.
      if (audioContextRef.current?.state === 'running') {
        await startAudio();
        await startVideoIteratorRef.current();
        playbackStateRef.current = 'playing';
        playerActions.setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error initializing media player:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Failed to load media');
    }
  }, []);

  const transcribe = useCallback(async () => {
    if (!audioTrackRef.current) {
      playerActions.setError('No audio track available for transcription');
      return;
    }

    try {
      playerActions.setTranscribing(true);
      playerActions.setTranscribeStage('Collecting audio data…');

      const format = usePlayerStore.getState().transcribeFormat;
      const fileName = usePlayerStore.getState().fileName;

      let audioBlob: Blob;
      let audioFileName: string;

      if (format === 'original') {
        // Create a separate Input for transcription so we don't compete
        // with the playback Input for audio track packets — no pause needed.
        const resource = resourceRef.current;
        if (!resource) throw new Error('No media resource available');

        const transcribeSource =
          resource instanceof File ? new BlobSource(resource) : new UrlSource(resource);
        const transcribeInput = new Input({ source: transcribeSource, formats: ALL_FORMATS });
        const transcribeAudioTrack = await transcribeInput.getPrimaryAudioTrack();
        if (!transcribeAudioTrack) throw new Error('No audio track found for transcription');

        const codec = await transcribeAudioTrack.getCodec();
        if (!codec) throw new Error('Audio track codec could not be determined');

        const codecParamString = await transcribeAudioTrack.getCodecParameterString();
        const decoderConfig = await transcribeAudioTrack.getDecoderConfig();

        // Collect raw audio packets from the independent track
        const encodedSink = new EncodedPacketSink(transcribeAudioTrack);
        const packets = [];
        const YIELD_EVERY = 10;

        // Quick count of total packets (metadata-only scan)
        let totalPackets = 0;
        for await (const _ of encodedSink.packets(undefined, undefined, { metadataOnly: true })) {
          totalPackets++;
        }

        for await (const packet of encodedSink.packets()) {
          packets.push(packet);
          playerActions.setTranscribeStage(
            `Collecting audio packets… ${packets.length} / ${totalPackets}`
          );

          // Yield to event loop every N packets so the UI stays responsive
          if (packets.length % YIELD_EVERY === 0) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        // Find the minimum timestamp — some AAC packets start negative.
        // Shift all timestamps so they start at 0.
        let minTs = Infinity;
        for (const p of packets) {
          if (p.timestamp < minTs) minTs = p.timestamp;
        }
        const tsShift = minTs < 0 ? -minTs : 0;

        // Build chunk metadata for the first add() call — required by the muxer.
        // For AAC: provide description (AudioSpecificConfig) so the muxer doesn't
        // try to parse ADTS headers from raw packets.
        const chunkMeta = {
          decoderConfig: {
            codec: codecParamString ?? codec,
            sampleRate: decoderConfig?.sampleRate ?? transcribeAudioTrack.sampleRate,
            numberOfChannels:
              decoderConfig?.numberOfChannels ?? transcribeAudioTrack.numberOfChannels,
            description: decoderConfig?.description ?? undefined,
          },
        };

        playerActions.setTranscribeStage(
          `Remuxing audio — ${packets.length} total packets`
        );

        const outputFormat = new Mp4OutputFormat();
        const bufferTarget = new BufferTarget();
        const output = new Output({ format: outputFormat, target: bufferTarget });

        const encodedSource = new EncodedAudioPacketSource(codec);
        const outputTrack = await output.addAudioTrack(encodedSource);
        await output.start();

        // Add packets in batches, yielding after each batch so the progress UI
        // has a chance to repaint.
        const REMUX_BATCH = 10;
        for (let i = 0; i < packets.length; i += REMUX_BATCH) {
          const end = Math.min(i + REMUX_BATCH, packets.length);
          for (let j = i; j < end; j++) {
            const pkt = packets[j];
            // Shift timestamp to be non-negative
            const shiftedPkt = tsShift > 0
              ? new EncodedPacket(
                  pkt.data,
                  pkt.type,
                  pkt.timestamp + tsShift,
                  pkt.duration,
                )
              : pkt;
            // Pass chunk metadata on the very first packet; await for backpressure
            await encodedSource.add(shiftedPkt, i === 0 && j === 0 ? chunkMeta : undefined);
          }
          const pct = Math.round((end / packets.length) * 100);
          playerActions.setTranscribeStage(
            `Remuxing audio — ${end} / ${packets.length} (${pct}%)`
          );
          // Yield so React can render the progress update
          await new Promise((r) => setTimeout(r, 0));
        }

        await output.finalize();

        const result = bufferTarget.buffer;
        if (!result) {
          throw new Error('Remux completed but no output buffer was produced');
        }

        audioBlob = new Blob([result], { type: 'video/mp4' });
        audioFileName = `${fileName}.mp4`;

        // Cleanup: dispose the transcription Input to free resources
        // and clear the packets array so GC can reclaim memory.
        transcribeInput.dispose();
        packets.length = 0;
      } else {
        // WAV path: collect decoded buffers, encode as PCM WAV
        if (!audioSinkRef.current) {
          throw new Error('Audio sink not available for WAV encoding');
        }

        const chunks: AudioBuffer[] = [];
        for await (const { buffer } of audioSinkRef.current.buffers(0)) {
          chunks.push(buffer);
          playerActions.setTranscribeStage(`Collecting audio data… (${chunks.length} chunks)`);
        }

        playerActions.setTranscribeStage(`Encoding WAV — ${chunks.length} chunks to process`);
        audioBlob = await audioBuffersToWav(chunks, audioTrackRef.current.sampleRate, (stage, done, total) => {
          const pct = Math.round((done / total) * 100);
          playerActions.setTranscribeStage(`${stage} — ${done.toLocaleString()} / ${total.toLocaleString()} (${pct}%)`);
        });
        audioFileName = `${fileName}.wav`;
      }

      playerActions.setTranscribeStage('Sending to server…');
      const formData = new FormData();
      formData.append('file', audioBlob, audioFileName);

      const response = await fetch(backendPath('/transcribe'), {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }

      const { task_id } = await response.json();

      playerActions.setTranscribeStage('Waiting for transcription…');

      // Count seconds while waiting for the server
      const waitStart = Date.now();
      const waitInterval = setInterval(() => {
        const secs = Math.floor((Date.now() - waitStart) / 1000);
        playerActions.setTranscribeStage(`Waiting for server… (${secs}s)`);
      }, 1000);

      const socket = new WebSocket(backendWsPath(`/ws/status/${task_id}`));

      await new Promise((resolve, reject) => {
        socket.onmessage = (event) => {
          clearInterval(waitInterval);
          const msg = JSON.parse(event.data);
          if (msg.status === 'PROCESSING') {
            playerActions.setTranscribing(true);
            playerActions.setTranscribeStage('Server is transcribing…');
          } else if (msg.status === 'DONE') {
            const resultsInSeconds = msg.results.map(
              ([start, end, text]: [number, number, string]) => [start / 1000, end / 1000, text] as [number, number, string]
            );
            // Defer to macrotask: rAF render loop gets to finish the current
            // video frame before React starts the expensive transcription render.
            setTimeout(() => {
              playerActions.setTranscriptionDone(resultsInSeconds);
              socket.close();
              resolve(true);
            }, 0);
          } else if (msg.status === 'ERROR') {
            playerActions.setTranscribing(false);
            reject(new Error(msg.results || 'Transcription error'));
          }
        };

        socket.onerror = (error) => {
          clearInterval(waitInterval);
          playerActions.setTranscribing(false);
          console.error('WebSocket error:', error);
          playerActions.setError('Failed to connect to transcription server');
          socket.close();
          reject(new Error('WebSocket error'));
        };
      });
    } catch (error) {
      console.error('Transcription error:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Transcription failed');
    }
  }, [audioSinkRef, audioTrackRef]);

  const cleanup = useCallback(async () => {
    playerActions.setTranscribing(false);
    playerActions.setIsEnded(false);
    stopRenderLoop();
    stopTranscribeFocus();
    speedUnsub();

    // Stop audio — same as transition to paused, but we're tearing down everything.
    await stopAudio();
    playbackStateRef.current = 'idle';

    void videoFrameIteratorRef.current?.return();
    videoFrameIteratorRef.current = null;

    // Clear canvas so the last frame doesn't linger
    if (canvasRef.current && canvasCtxRef.current) {
      canvasCtxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    if (audioContextRef.current) {
      // Stop clipping monitor
      const a = analyserRef.current;
      if (a && (a as any)._clipInterval) {
        clearInterval((a as any)._clipInterval);
      }
      stNodeRef.current?.disconnect();
      stNodeRef.current = null;
      compressorRef.current?.disconnect();
      compressorRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      await audioContextRef.current.close();
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
    getVideoTrack: () => videoTrackRef.current,
    getAudioContext: () => audioContextRef.current,
    getInput: () => inputRef.current,
  };
}
