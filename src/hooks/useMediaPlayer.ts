import { useCallback, useRef, useEffect } from 'react';

// E2E diagnostic — global type + startAudioDiagnostic
import { startAudioDiagnostic } from '../utils/audioDiagnostic';
import { startAudioMonitor } from '../utils/audioMonitor';
import { usePlayerStore, playerActions } from '../store/playerStore';
import { createSoundEffectsEngine } from '../features/player/SoundEffects';
import { useTranscribe } from '../features/transcription/useTranscribe';
import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  CanvasSink,
  Input,
  InputAudioTrack,
  WrappedAudioBuffer,
  WrappedCanvas,
} from 'mediabunny';
import { PhaseVocoderNode } from '@soundtouchjs/phase-vocoder-worklet';

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
  const stNodeRef = useRef<PhaseVocoderNode | null>(null);
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
  // "idle" | "playing" | "transitioning" | "paused" — only one transition at a time.
  const playbackStateRef = useRef<string>('idle');

  // Immediate abort flag — set by stopAudio BEFORE iterator.return().
  // Stays true until startAudio resets it AFTER the old iterator is dead.
  // This prevents the old iterator from creating BufferSources while
  // the new one is being set up.
  const abortAudioRef = useRef<boolean>(false);

  // Generation counter — defense-in-depth against overlapping audio.
  // Incremented in startAudio AFTER the old iterator is dead (lock released).
  // The runAudioIterator captures the current generation and checks it on
  // every loop iteration. If the generation changed, the old iterator exits
  // immediately — even if abortAudioRef was already reset.
  // This eliminates the race window where:
  //   stopAudio → abort=true → lock released → abort=false →
  //   old iterator resumes → creates nodes → overlap with new iterator.
  const audioGenerationRef = useRef<number>(0);

  const playLoopRef = useRef<number>(0);
  const lastTranscribeFocusRef = useRef<number>(0);
  const lastProgressBarUpdateRef = useRef<number>(0);

  // === E2E diagnostic — exposed to window for Playwright tests ===
  // Tracks the peak number of BufferSource nodes that are actually
  // in "playing" state at the same time (not just scheduled). > 2 means
  // multiple audio streams playing simultaneously (race condition).
  const peakPlayingSourcesRef = useRef<number>(0);

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
      const state = playbackStateRef.current;
      // Time only advances during 'playing'. During 'transitioning', time is
      // frozen at the value captured by stopAudio. This is correct for:
      // - Pause: displayed time freezes immediately (no jump during transition).
      // - Speed change: stopAudio already captured the right time; during
      //   bootstrap wait the display is frozen briefly — acceptable (quality > speed).
      // - Seek: playbackTimeAtStartRef is set to the seek target before transitioning.
      if (state === 'playing') {
        if (audioContextRef.current && audioContextStartTimeRef.current != null) {
          return (audioContextRef.current.currentTime - audioContextStartTimeRef.current) * speed + playbackTimeAtStartRef.current;
        }
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
  // PhaseVocoderNode is a pitch compensator:
  //   source.playbackRate = speed → accelerates audio (chipmunk)
  //   stNode.playbackRate = speed → compensates pitch back to normal
  // Net effect: speed-up without chipmunk.
  //
  // Phase vocoder (FFT-based) — no WSOLA stretch parameters needed.
  // Timing is controlled by fftSize and overlapFactor set at construction.
  //
  // Lock: only one speed transition at a time. If the user clicks fast,
  // only the final speed (from playbackSpeedRef) is applied.
  const speedTransitionRef = useRef<boolean>(false);

  // Resolved when PhaseVocoderNode FIFO has enough samples for quality audio.
  // Set at the start of startAudio(), resolved by the metrics handler,
  // and awaited before video/playback state is started.
  const audioReadyResolveRef = useRef<(() => void) | null>(null);

  // Resolved when the first audio buffer is scheduled in runAudioIterator.
  // This ensures getPlaybackTime() is accurate from the first sample —
  // audioContextStartTimeRef is set right before the buffer starts, so
  // reported time = actual audio position.
  const firstBufferResolveRef = useRef<(() => void) | null>(null);

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
          const stNode = stNodeRef.current;
          const ctx = audioContextRef.current;
          const now = ctx?.currentTime ?? 0;

      // 1. Save current media time using the OLD speed.
          // CRITICAL: stopAudio() reads playbackSpeedRef.current to calculate
          // currentTime. If we update it first, stopAudio gets the wrong time:
          //   - 2x→1x: reads half the real position → seek backward → overlap
          //   - 1x→2x: reads double the real position → seek forward → skip
          const oldSpeed = playbackSpeedRef.current;
          const currentMediaT = ctx && audioContextStartTimeRef.current != null
            ? (ctx.currentTime - audioContextStartTimeRef.current) * oldSpeed + playbackTimeAtStartRef.current
            : playbackTimeAtStartRef.current;

          // 2. Update PhaseVocoderNode rate — must happen before bridge silence
          // so the processor uses the new rate from the start.
          if (stNode) {
            stNode.playbackRate.setValueAtTime(speed, now);
          }

          // 3. If a transition (seek/pause/play) is already in progress,
          // skip — the in-progress transition will use the new speed
          // (read from playbackSpeedRef) when it restarts audio.
          if (playbackStateRef.current === 'transitioning') {
            console.log(`[audio] speed change ${prevSpeed}x→${speed}x during transition, skipping`);
            return;
          }

          const wasPlaying = playbackStateRef.current === 'playing';

          // 4. Bridge silence: start feeding PhaseVocoderNode at the new speed
          // BEFORE stopping old audio. This ensures the FIFO never drains.
          // Warmup (3s of silence at init) pre-fills the FIFO, so bridge only
          // needs to cover the brief stop→start gap — 800ms is enough.
          if (wasPlaying && stNode && ctx && speed > 1) {
            const bridgeMs = 800;
            const bridgeSamples = Math.ceil(ctx.sampleRate * bridgeMs / 1000);
            const bridgeBuffer = ctx.createBuffer(2, bridgeSamples, ctx.sampleRate);
            const bridgeSource = ctx.createBufferSource();
            bridgeSource.buffer = bridgeBuffer;
            bridgeSource.playbackRate.setValueAtTime(speed, now);
            bridgeSource.connect(stNode);
            bridgeSource.start(now);
            console.log(`[audio] bridge silence: ${bridgeSamples} samples (${bridgeMs}ms at ${speed}x)`);
          }

         // 5. Use transitionRef — stopAudio reads oldSpeed from playbackSpeedRef.
          // beforeStartAudio callback updates playbackSpeedRef AND resets
          // audioContextStartTimeRef to ctx.currentTime. This is critical:
          // - playbackSpeedRef must be updated before startAudio (correct bootstrap)
          // - audioContextStartTimeRef must be updated at the same time, otherwise
          //   getPlaybackTime() in the rAF loop uses (ctx.time - old_T0) * newSpeed
          //   → time jumps forward → video skips frames → audio rushes ahead
          // With both updated together: (ctx.time - new_T0) * newSpeed + currentMediaT
          // = 0 + currentMediaT = correct time, no jump.
          if (wasPlaying && audioSinkRef.current) {
            await transitionRef.current('playing', currentMediaT, () => {
              playbackSpeedRef.current = speed;
              audioContextStartTimeRef.current = ctx.currentTime;
            });

            // Reset underrun counter so carry-over from 1x (where
            // underruns accumulate silently with stGain=0) doesn't inflate
            // the first delta at the new speed.
            prevUnderrunsRef.current = liveUnderrunCountRef.current;
          } else if (!wasPlaying) {
            // Was paused — just update gain routing if needed.
            playbackSpeedRef.current = speed;
            if (bypassGainRef.current && stGainRef.current && ctx) {
              bypassGainRef.current.gain.setValueAtTime(speed === 1 ? 1 : 0, ctx.currentTime);
              stGainRef.current.gain.setValueAtTime(speed === 1 ? 0 : 1, ctx.currentTime);
            }
          }
        } finally {
          speedTransitionRef.current = false;
        }
      }
    },
  );

  // === Sound effects engine — extracted to SoundEffects module ===
  const soundEffects = createSoundEffectsEngine({
    audioContextRef,
    gainNodeRef,
    queuedAudioNodesRef,
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

      // Don't draw frames during 'transitioning' — audio isn't ready yet,
      // so drawing would make video get ahead of audio (seek lag).
      if (playbackStateRef.current === 'transitioning') break;

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

    // Don't draw during 'transitioning' — audio isn't ready yet,
    // so drawing would make video get ahead of audio (seek lag).
    // The rAF loop will draw these frames once state becomes 'playing'.
    if (playbackStateRef.current !== 'transitioning') {
      nextFrameRef.current = secondFrame;
      if (firstFrame) {
        utilsRef.current.drawFrame(firstFrame);
      }
    } else {
      // During transitioning, put first frame as nextFrame so the rAF
      // loop can draw it at the right time once audio is ready.
      nextFrameRef.current = firstFrame ?? secondFrame;
    }
  });

  // =====================================================================
  //  Stable refs for stopAudio / startAudio — read by transitionRef and
  //  the speed-transition subscriber so they always use the latest closure
  //  even after a React re-render.
  // =====================================================================
  const stopAudioRef = useRef<() => Promise<void>>(null!);
  const startAudioRef = useRef<() => Promise<void>>(null!);

  // =====================================================================
  //  STOP-AUDIO — the only place that tears down audio nodes.
  //  Returns a Promise that resolves when all nodes are truly silent.
  // =====================================================================
 const stopAudio = async () => {
    console.log('[audio] stopAudio start, state=', playbackStateRef.current);

    // CRITICAL: read current time BEFORE changing playbackStateRef.
    // getPlaybackTime() returns frozen time when state !== 'playing',
    // so setting 'transitioning' first would cause us to read stale time.
    const ctx = audioContextRef.current;
    const currentTime = ctx && audioContextStartTimeRef.current != null
      ? (ctx.currentTime - audioContextStartTimeRef.current) * playbackSpeedRef.current + playbackTimeAtStartRef.current
      : playbackTimeAtStartRef.current;

   // Recalibrate audioContextStartTimeRef so getPlaybackTime() is accurate
    // from the moment audio resumes after the transition.
    // Without this: during startAudio() wait, ctx.currentTime advances but
    // audioContextStartTimeRef still points to the old epoch → getPlaybackTime()
    // returns a time way ahead of the actual audio → video races ahead of audio.
    if (ctx && audioContextStartTimeRef.current != null) {
      audioContextStartTimeRef.current = ctx.currentTime;
    }
    playbackTimeAtStartRef.current = currentTime;

    // IMMEDIATE ABORT — set before anything else so runAudioIterator
    // sees it on the very next iteration check, before creating new nodes.
    // Generation increment is done in startAudio AFTER the old iterator is dead,
    // so the new iterator captures a clean generation and stale iterators
    // see a mismatch and exit immediately.
    abortAudioRef.current = true;

    playerActions.setCurrentTime(currentTime);
    playerActions.setIsPlaying(false);

    // Abort the audio iterator — await return() to ensure it finishes before
    // we start a new one. Without await, the old iterator could spawn BufferSources
    // alongside the new one → multiple streams playing simultaneously.
    // The bridge silence (started before stopAudio) keeps PhaseVocoderNode fed.
    // FIX: 500ms timeout on return() — MediaBunny's return() may not propagate
    // to a consumer stuck in backpressure await.
    if (audioBufferIteratorRef.current) {
      const returnPromise = audioBufferIteratorRef.current.return();
      const timeoutPromise = new Promise(r => setTimeout(r, 500));
      const result = await Promise.race([returnPromise, timeoutPromise]);
      if (result === undefined && audioBufferIteratorRef.current) {
        console.warn('[audio] stopAudio: iterator.return() timed out after 500ms');
      }
      audioBufferIteratorRef.current = null;

      // CRITICAL: wait for runAudioIterator to fully exit its for-await loop
      // and fire the finally block (which releases the lock) BEFORE stopping nodes.
      // If we stop+clear nodes first, the old iterator could create a BufferSource
      // AFTER the clear but BEFORE the lock is released → that node plays uncontrolled
      // alongside the new iterator's nodes → multiple segments simultaneously.
      // abortAudioRef is already set — runAudioIterator will break on next iteration check.
      let waitAttempts = 0;
      while (runAudioIteratorLockRef.current && waitAttempts < 150) {
        await new Promise(r => setTimeout(r, 20));
        waitAttempts++;
      }
      if (runAudioIteratorLockRef.current) {
        console.warn('[audio] stopAudio: runAudioIterator still locked after 3s, force-clearing');
        runAudioIteratorLockRef.current = false;
      }
    }

    // Stop all queued nodes and wait for the audio thread to silence them.
    // FIX: use stop(0) instead of stop(stopAt). stopAt = ctx.currentTime + 5ms
    // meant that nodes scheduled for the future (start > stopAt) were NOT stopped —
    // the stop event fired before the start event, so the node was in "unstarted"
    // state and the stop was a no-op. The node started normally and played alongside
    // the new iterator's nodes → multiple segments simultaneously.
    // stop(0) with 0 < ctx.currentTime → stops immediately, cancelling future starts.
    if (ctx && ctx.state !== 'closed' && queuedAudioNodesRef.current.size > 0) {
      for (const node of queuedAudioNodesRef.current) {
        node.stop(0);
      }
      queuedAudioNodesRef.current.clear();
      // Wait for the audio thread to process stop events (1 render quantum ≈ 3ms at 48kHz).
      await new Promise(r => setTimeout(r, 10));
    }

    // Reset triggered effects so they can fire again on next play.
    soundEffects.triggeredEffectsRef.current.clear();

    // IMPORTANT: do NOT reset abortAudioRef here. It stays true until
    // startAudio explicitly resets it — after the new iterator is created
    // and running. This closes the race window where:
    //   stopAudio → abort=false → old iterator resumes → creates nodes →
    //   overlap with new iterator's nodes.
    // The old iterator will see abort=true + generation mismatch and exit.

    // Don't set 'paused' here — transitionRef handles the final state.
    // If called from initMediaPlayer/cleanup, they set state after.
    console.log('[audio] stopAudio done');
  };

  // =====================================================================
  //  START-AUDIO — the only place that creates the audio iterator.
  //  Must NOT be called while an iterator is already running.
  //
  //  At >1x: starts the audio iterator (bootstrap silence → PhaseVocoderNode),
  //  then waits for FIFO to fill (via metrics event). Video
  //  and 'playing' state are only started after audio is ready.
  //  At 1x: returns immediately (PhaseVocoderNode is bypassed, no FIFO to fill).
  // =====================================================================
  const startAudio = async () => {
    console.log('[audio] startAudio start, state=', playbackStateRef.current, 'speed=', playbackSpeedRef.current, 'iterator=', !!audioBufferIteratorRef.current, 'lock=', runAudioIteratorLockRef.current);
    if (!audioSinkRef.current || !audioContextRef.current) {
      console.warn('[audio] startAudio aborted: missing sink or context');
      return;
    }
    if (audioBufferIteratorRef.current) {
      console.warn('[audio] startAudio aborted: iterator already running');
      return; // already running
    }

    const ctx = audioContextRef.current;
    const speed = playbackSpeedRef.current;

    // Ensure gain routing matches current speed.
    if (bypassGainRef.current && stGainRef.current) {
      bypassGainRef.current.gain.setValueAtTime(speed === 1 ? 1 : 0, ctx.currentTime);
      stGainRef.current.gain.setValueAtTime(speed === 1 ? 0 : 1, ctx.currentTime);
    }

    // Wait for the old iterator to finish. Without this, a new iterator could start
    // while the old one is still spawning BufferSources → multiple streams.
    let waitAttempts = 0;
    while (runAudioIteratorLockRef.current && waitAttempts < 150) {
      await new Promise((r) => setTimeout(r, 20));
      waitAttempts++;
    }
    if (runAudioIteratorLockRef.current) {
      console.warn('[audio] startAudio: old iterator still running after 3s, force-starting');
    }

   // Start the audio iterator — it feeds bootstrap silence into PhaseVocoderNode.
    // audioContextStartTimeRef is NOT set here — it's set in runAudioIterator
    // right before the first buffer is scheduled. This ensures getPlaybackTime()
    // is accurate from the first sample (no drift from lock wait / decode time).
    // Until then, getPlaybackTime() returns frozen time (state = 'transitioning').
    // FIX: initialize to current playback time so the first buffer from MediaBunny
    // doesn't trigger a false [gap] warning (the iterator starts at this position).
    lastBufferEndRef.current = utilsRef.current.getPlaybackTime();

    // CRITICAL: increment generation BEFORE resetting abortAudioRef.
    // The new runAudioIterator captures generation as its first action.
    // Then we reset abort — any old iterator that resumes between gen-increment
    // and abort-reset sees generation mismatch and exits immediately.
    // If we reset abort first (old code), the old iterator could resume,
    // see abort=false + old generation, and create BufferSources alongside
    // the new iterator → overlapping audio.
    audioGenerationRef.current++;

    audioBufferIteratorRef.current = audioSinkRef.current.buffers(utilsRef.current.getPlaybackTime());
    void runAudioIteratorRef.current?.();
    // abortAudioRef is reset inside runAudioIterator AFTER capturing generation.
    // This guarantees no race window.

    // Wait for bootstrap silence to warm up PhaseVocoderNode before proceeding.
    // At 1x, PhaseVocoderNode is bypassed (stGain=0) — no wait needed.
    // We listen for the metrics signal (framesBuffered >= 400 for 2 streaks) rather than
    // relying on a fixed timeout — the FIFO is ready when it's ready.
    if (speed > 1) {
      const startTime = Date.now();
      audioReadyResolveRef.current = () => {}; // no-op placeholder
      // The metrics handler (set up in initMediaPlayer) will resolve this
      // when framesBuffered >= 400 (achievable even at 1.25x).
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

    // Wait for the first buffer to be scheduled. This ensures audioContextStartTimeRef
    // is set (by runAudioIterator) before we return and transitionRef sets 'playing'.
    // getPlaybackTime() then returns the correct media time from the first sample.
    const firstBufferReady = new Promise<void>((resolve) => {
      firstBufferResolveRef.current = resolve;
      // Safety: if runAudioIterator never schedules a buffer, proceed after 1s.
      setTimeout(() => {
        if (firstBufferResolveRef.current === resolve) {
          firstBufferResolveRef.current = null;
          if (audioContextStartTimeRef.current == null) {
            audioContextStartTimeRef.current = ctx.currentTime;
          }
          resolve();
        }
      }, 1000);
    });
    await firstBufferReady;

    console.log('[audio] startAudio done');
  };

  // Keep refs in sync so transitionRef + speed subscriber always call the latest.
  stopAudioRef.current = stopAudio;
  startAudioRef.current = startAudio;

  // =====================================================================
  //  TRANSITION — the single entry point for all playback state changes.
  //  target: 'playing' | 'paused'
  //  seekTo: optional media-time to jump to before playing.
  //
  //  Reads stopAudio / startAudio via refs to avoid stale closures after
  //  a React re-render.
  // =====================================================================
  const transitionRef = useRef<
    (target: 'playing' | 'paused', seekTo?: number, beforeStartAudio?: () => void) => Promise<void>
  >(null!);

  transitionRef.current = async (target, seekTo, beforeStartAudio) => {
    // If a transition is already in progress, wait for it to complete
    // rather than rejecting. This prevents race conditions where e.g.
    // pause→seek→play fires before pause completes, causing the seek
    // to be silently dropped.
    if (playbackStateRef.current === 'transitioning') {
      console.log('[audio] transition queued: already transitioning, waiting for target=', target, seekTo != null ? `(seek ${seekTo})` : '');
      const deadline = Date.now() + 5000;
      while (playbackStateRef.current === 'transitioning') {
        if (Date.now() > deadline) {
          console.warn('[audio] transition queued: timeout waiting for prior transition');
          break;
        }
        await new Promise(r => setTimeout(r, 20));
      }
      // Re-evaluate after the prior transition completes.
      // The prior transition may have put us in the target state already,
      // so re-check the no-op conditions below.
    }

    // If already in the target state AND not seeking, no-op.
    if (seekTo == null && target === 'playing' && playbackStateRef.current === 'playing') return;
    if (seekTo == null && target === 'paused' && playbackStateRef.current === 'paused') return;

    const wasPlaying = playbackStateRef.current === 'playing';

    console.log('[audio] transition:', wasPlaying ? 'playing' : playbackStateRef.current, '→', target, seekTo != null ? `(seek ${seekTo})` : '');

    try {
      // Mark as transitioning — blocks other transitions until we're done.
      playbackStateRef.current = 'transitioning';

      // Stop current audio if was playing — reads playbackSpeedRef.current
      // for time calculation. Speed subscriber passes oldSpeed here by NOT
      // updating playbackSpeedRef yet (uses beforeStartAudio callback).
      if (wasPlaying) {
        await stopAudioRef.current();
      }

      // If seeking, update position and video iterator.
      if (seekTo != null) {
        playbackTimeAtStartRef.current = seekTo;
        playerActions.setCurrentTime(seekTo);
        playerActions.setIsEnded(false);
        soundEffects.triggeredEffectsRef.current.clear();
        await startVideoIteratorRef.current();
      }

 // Start audio if target is playing.
      if (target === 'playing') {
        // If at the end of the media, reset to the beginning.
        const currentDuration = usePlayerStore.getState().duration;
        if (currentDuration > 0 && utilsRef.current.getPlaybackTime() >= currentDuration) {
          playbackTimeAtStartRef.current = 0;
          playerActions.setCurrentTime(0);
          playerActions.setIsEnded(false);
          soundEffects.triggeredEffectsRef.current.clear();
          await startVideoIteratorRef.current();
        }

        // beforeStartAudio: speed subscriber uses this to update playbackSpeedRef
        // AFTER stopAudio (so stopAudio reads oldSpeed for correct time capture)
        // but BEFORE startAudio (so startAudio reads newSpeed for correct bootstrap).
        if (beforeStartAudio) {
          beforeStartAudio();
        }

        let audioStarted = true;
        if (audioContextRef.current?.state === 'suspended') {
          try {
            await audioContextRef.current.resume();
          } catch (e) {
            console.warn('[audio] AudioContext resume blocked (no user gesture):', e);
          }
          // resume() may resolve but context stays suspended (no user gesture).
          // If still suspended, we CANNOT start audio — and we should NOT
          // set isPlaying=true because the UI would show a pause button.
          // The user clicking pause would stop playback, but clicking play
          // (which they need to resume AudioContext) would be a no-op because
          // playbackState is 'playing'. Instead, stay paused and let the user's
          // click on the play button resume AudioContext with a real gesture.
          if (audioContextRef.current?.state === 'suspended') {
            console.warn('[audio] AudioContext still suspended after resume() — playback paused, waiting for user gesture');
            audioStarted = false;
          }
        }
        // startAudio() waits for PhaseVocoderNode FIFO to be ready at >1x.
        // After it resolves, audio is quality — safe to start video + time.
        if (audioStarted) {
          // Set 'playing' AFTER startAudio so getPlaybackTime() stays frozen
          // (at playbackTimeAtStartRef) until audio is actually ready.
          //
          // Without this: stopAudio recalibrates audioContextStartTimeRef to
          // ctx.currentTime. Then 'playing' is set → rAF advances. Then
          // startAudio calls buffers(getPlaybackTime()) which reads a time
          // ahead of the seek target (e.g. 50.1s instead of 50.0s). Audio
          // skips the first ~100ms → sound lags behind video.

          // Add a timeout to startAudio — if it hangs (e.g. firstBufferReady
          // doesn't resolve), we don't want the transition to hang forever.
          const startAudioPromise = startAudioRef.current();
          const startAudioTimeout = new Promise(r => setTimeout(r, 3000));
          await Promise.race([startAudioPromise, startAudioTimeout]);

          playbackStateRef.current = 'playing';
          playerActions.setIsPlaying(true);
        } else {
          // AudioContext is suspended and resume() failed (no user gesture).
          // Stay paused — set audioLocked so the UI shows a "click to unlock"
          // overlay. When the user clicks it, the gesture resumes AudioContext.
          playbackStateRef.current = 'paused';
          playerActions.setIsPlaying(false);
          playerActions.setAudioLocked(true);
        }
      } else {
        playbackStateRef.current = 'paused';
      }
    } finally {
      // If something went wrong and state is still 'transitioning', reset to paused.
      if (playbackStateRef.current === 'transitioning') {
        console.warn('[audio] transition failed: state is still transitioning, resetting to paused');
        playbackStateRef.current = 'paused';
        playerActions.setIsPlaying(false);
      }
    }
  };

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

        // Don't draw video during 'transitioning' — audio isn't ready yet.
        // Without this guard, the first frame at the seek target is drawn
        // immediately while audio is still starting up → video ahead of audio.
        const isTransitioning = playbackStateRef.current === 'transitioning';
        if (!isTransitioning && nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
          utilsRef.current.drawFrame(nextFrameRef.current);
          nextFrameRef.current = null;
          void updateNextFrameRef.current();
        }

        utilsRef.current.updateProgressBarTime(playbackTime);

        // Check and trigger sound effects
        soundEffects.checkSoundEffects(playbackTime);
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
        const isTransitioning = playbackStateRef.current === 'transitioning';
        if (!isTransitioning && nextFrameRef.current && nextFrameRef.current.timestamp <= playbackTime) {
          utilsRef.current.drawFrame(nextFrameRef.current);
          nextFrameRef.current = null;
          void updateNextFrameRef.current();
        }
        utilsRef.current.updateProgressBarTime(playbackTime);
        soundEffects.checkSoundEffects(playbackTime);
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

 // === E2E diagnostic: exposed to window for Playwright ===
  useEffect(() => {
    const stop = startAudioDiagnostic({
      queuedAudioNodesRef,
      peakPlayingSourcesRef,
      audioBufferIteratorRef,
      runAudioIteratorLockRef,
      playbackStateRef,
      getPlaybackTime: utilsRef.current.getPlaybackTime,
      analyserRef,
      bypassGainRef,
      stGainRef,
    });
    return stop;
  }, []);

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
   * Audio playback iterator — uses PhaseVocoderNode for pitch-preserving time-stretch.
   *
   * source.playbackRate = speed → faster audio stream (chipmunk)
   * stNode.playbackRate = speed → phase vocoder compensates pitch back to normal
   * Net effect: speed-up without chipmunk.
   *
   * Phase vocoder (fftSize=2048, overlapFactor=4) — smoother than WSOLA
   * at extreme ratios, with inherent fftSize-sample latency.
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

      // Capture the generation at startup — if it changes, stopAudio was called
      // and this iterator is stale.
      const myGeneration = audioGenerationRef.current;

      // NOW safe to reset abortAudioRef — the new iterator has captured
      // the generation. Any old iterator that resumes sees generation mismatch
      // and exits before creating nodes (even if abort=false).
      abortAudioRef.current = false;
     
      const ctx = audioContextRef.current;
      const stNode = stNodeRef.current;
      const speed = playbackSpeedRef.current;

   // Bootstrap: at speeds > 1x, PhaseVocoderNode needs fftSize samples of input
      // to produce its first output window. Feed silence to prime the pipeline.
      // Scale with speed: at higher speeds the processor drains the FIFO
      // faster, so we need more silence to keep it warm.
      // The bridge silence (in speed transition) feeds PhaseVocoderNode before this,
      // and the warmup (at init) pre-fills the FIFO. Bootstrap adds final headroom.
      // At 1.5x: 400*1.5=600ms of silence samples, played at 1.5x = 400ms wall-clock.
      // At 2x: 800ms samples, 400ms wall-clock.
      // At 1x: no bootstrap — bypassGain=1 means audio goes directly to output,
      // and PhaseVocoderNode is muted (stGain=0). A bootstrap would eat into the first
      // 50ms of real audio, causing the "jumbled segments" artifact at start.
      const BOOTSTRAP_MS = speed > 1 ? Math.ceil(400 * speed) : 0;

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
      let lastEnd = ctx.currentTime + (BOOTSTRAP_MS / 1000) / speed;

      // Margin to add after onended fires — onended triggers ~1 render quantum
      // before the node is truly silent on the Web Audio render thread.
      // ~128 samples ≈ 2.67ms at 48kHz. We use 3ms to be safe.
      const RENDER_QUANTUM_MARGIN = 0.003;

      // Track the actual end time of each BufferSource via the 'ended' event.
      // This corrects for speed changes that occur mid-buffer — when speed
      // increases, the buffer finishes earlier than the scheduled lastEnd.
      // When speed decreases, it finishes later.
      let actualEndCorrection: number | null = null;

      // Periodic yield counter: every 30 buffers (~1s of audio at 33ms/buffer)
      // yield to the event loop so the rAF video render loop isn't starved.
      // Without this, the iterator processes 4s of audio (aheadThreshold at 1x)
      // in a single microtask drain → visible video stuttering.
      let yieldCounter = 0;

      // Recalibrate audioContextStartTimeRef right before the first buffer starts.
      // startAudio() may not set it (or set it early), so we recalibrate to the
      // actual start time of the first buffer. This eliminates apparent rate < 1.0x
      // caused by the gap between startAudio() and the first buffer.
      let isFirstBuffer = true;

      
      for await (const wrapped of audioBufferIteratorRef.current) {
               // GENERATION CHECK — primary defense. Must come FIRST because
        // abortAudioRef may be reset by startAudio while the old iterator
        // is still alive. The generation counter is monotonically increasing
        // and never reset, so stale iterators always see a mismatch.
        if (audioGenerationRef.current !== myGeneration) {
          console.log('[audio] runAudioIterator: stale generation, exiting (gen=' + myGeneration + ', current=' + audioGenerationRef.current + ')');
          break;
        }

        // ABORT CHECK — secondary defense. If stopAudio was called, exit
        // immediately. iterator.return() may take time to propagate
        // (for-await machinery), but abortAudioRef is set instantly by stopAudio.
        if (abortAudioRef.current) {
          console.log('[audio] runAudioIterator: aborted before node creation');
          break;
        }

        const currentMediaT = utilsRef.current.getPlaybackTime();

        // Diagnostic: log gaps between buffers (gap → underrun → click)
        const gap = wrapped.timestamp - lastBufferEndRef.current;
        lastBufferEndRef.current = wrapped.timestamp + wrapped.buffer.duration;
        if (gap > 0.001 && gap < 5) {
          console.warn(
            `[gap] ${gap.toFixed(3)}s between buffers at mediaT=${currentMediaT.toFixed(3)}s`
          );
        }
        // Overlap detection — buffers overlap in media time → same audio played twice
        if (gap < -0.001) {
          console.error(
            `[overlap] buffers overlap by ${Math.abs(gap).toFixed(3)}s at mediaT=${currentMediaT.toFixed(3)}s`
          );
        }
       const currentSpeed = playbackSpeedRef.current;
        const bufferEndAtSpeed = wrapped.buffer.duration / currentSpeed;

  // Apply correction from the previous buffer's actual end time.
  // onended fires BEFORE audio truly stops on the render thread —
  // the node is still producing samples in the current render quantum
  // (~128 samples ≈ 2.67ms at 48kHz). Without a margin, the next buffer
  // starts while the previous one is still playing → overlap → click/pop.
  // We add RENDER_QUANTUM_MARGIN to ensure clean handoff.
  // At 1x: use correction with margin. expectedEnd is mostly accurate,
  // but the correction provides feedback from the real audio clock.
  // Without it, accumulated JS scheduler drift creates gaps at buffer
  // boundaries → clicks. Margin needed at ALL speeds where onended fires.
        if (actualEndCorrection != null) {
          // At all speeds: apply correction with margin. onended fires ~2.9ms
          // before audio truly stops on the render thread. Without margin,
          // the next buffer starts while the previous one is still playing →
          // overlap → "каша из семплов" (two voices out of sync).
          // CRITICAL: only apply if correction is ahead of lastEnd.
          // If actualEndCorrection < lastEnd, the onended fires for a buffer
          // that was already scheduled — applying it would make lastEnd jump
          // backward → next buffer starts before the previous one → overlap.
          if (actualEndCorrection + RENDER_QUANTUM_MARGIN > lastEnd) {
            lastEnd = actualEndCorrection + RENDER_QUANTUM_MARGIN;
            actualEndCorrection = null;
          }
        }

        // Safety: if lastEnd is in the past (speed change created a gap),
        // fill the gap with silence so PhaseVocoderNode FIFO doesn't starve.
        // At 1x: skip the gap filler — silence through bypassGain is audible
        // as a stutter (hard boundary with real audio). Let the hardware
        // produce natural silence instead, then chain the next buffer.
        if (lastEnd < ctx.currentTime) {
          if (currentSpeed > 1) {
            const gapDur = ctx.currentTime - lastEnd;
            // At speed > 1x, playbackRate = speed shortens wall-clock duration.
            // Multiply by speed so the gap filler lasts exactly gapDur in wall-clock
            // (lastEnd + gapDur = ctx.currentTime), fully covering the gap.
            const gapSamples = Math.ceil(ctx.sampleRate * gapDur * currentSpeed);
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

        // First buffer: recalibrate audioContextStartTimeRef to account for the time
        // elapsed between beforeStartAudio (or startAudio) and the actual first buffer.
        // Bootstrap silence advances ctx.currentTime, so T0 set earlier is stale.
        // We set audioContextStartTimeRef = snappedStart so that:
        //   getPlaybackTime() = (ctx.time - snappedStart) * speed + playbackTimeAtStartRef
        // At ctx.time = snappedStart: getPlaybackTime() = playbackTimeAtStartRef. ✓
        // Old formula was: snappedStart - playbackTimeAtStartRef / speed, which
        // double-counted playbackTimeAtStartRef → 2x time jump on pause→play.
        if (isFirstBuffer) {
          audioContextStartTimeRef.current = snappedStart;
          isFirstBuffer = false;
          if (firstBufferResolveRef.current) {
            const resolve = firstBufferResolveRef.current;
            firstBufferResolveRef.current = null;
            resolve();
          }
        }

        stNode.playbackRate.setValueAtTime(currentSpeed, ctx.currentTime);
        const source = ctx.createBufferSource();
        source.buffer = wrapped.buffer;
        // Only set playbackRate if it differs from the default (1.0) to avoid
        // unnecessary automation events that can cause artifacts at 1x.
        if (currentSpeed !== 1) {
          source.playbackRate.setValueAtTime(currentSpeed, ctx.currentTime);
        }

        // Buffer-boundary gain: at >1x, fade-in from 0.5 smooths DC discontinuities
        // caused by PhaseVocoderNode processing. At 1x, PhaseVocoderNode is bypassed (stGain=0) —
        // audio goes directly through bypassGain, so starting at 0.5 creates an
        // audible amplitude dip (previous buffer ends at 1.0, new one starts at 0.5).
        // Use gain=1 at 1x to avoid the dip.
        // The first buffer gets a fade-in at >1x to mask the silence-to-audio transition
        // artifact inside the PhaseVocoderNode (spectral smearing from FFT window boundary).
        // At 1x, PhaseVocoderNode is bypassed — no artifact to mask. A fade-in from 0.5
        // creates an audible amplitude dip → onset click.
        const bufGain = ctx.createGain();
        if (currentSpeed === 1) {
          // At 1x: no fade-in, gain=1 from the start.
          bufGain.gain.setValueAtTime(1, snappedStart);
        } else if (isFirstBuffer) {
          // First buffer at >1x: fade from 0.5 to 1.0 over 10ms to mask PhaseVocoderNode
          // bootstrap-to-audio transition (spectral smearing from FFT window boundary).
          bufGain.gain.setValueAtTime(0.5, snappedStart);
          bufGain.gain.setTargetAtTime(1, snappedStart, 0.01);
        } else {
          bufGain.gain.setValueAtTime(0.5, snappedStart);
          bufGain.gain.setTargetAtTime(1, snappedStart, 0.001);
        }

        // Always feed PhaseVocoderNode (FIFO stays warm). Also feed bypassGain for 1x.
        source.connect(stNode);
        source.connect(bufGain);
        bufGain.connect(bypassGainRef.current!);

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

        // Periodic yield: every 30 buffers (~1s of audio) yield to the
        // event loop so the rAF video render loop isn't starved.
        yieldCounter++;
        if (yieldCounter >= 30) {
          yieldCounter = 0;
          await new Promise(r => setTimeout(r, 0));
        }

        // Backpressure: slow down to avoid scheduling too far ahead.
        // At 1x, MediaBunny can be slow — keep 4s ahead to prevent gaps
        // (gap filler doesn't work at 1x).
        // CRITICAL: reset actualEndCorrection before waiting. During the wait,
        // onended callbacks from scheduled buffers fire and set actualEndCorrection.
        // Without reset, the stale correction would be applied to the NEXT buffer
        // after the wait, causing lastEnd to jump backward → overlap.
        actualEndCorrection = null;
        // At >1x, keep 2s ahead (iterating faster = fewer FIFO gaps).
        const aheadThreshold = currentSpeed > 1 ? 2 : 4;
        const aheadTarget = aheadThreshold - 0.5;
        if (wrapped.timestamp - utilsRef.current.getPlaybackTime() >= aheadThreshold) {
          await new Promise((resolve) => {
            const id = setInterval(() => {
              // FIX: if playback is not 'playing' (pause in progress), break
              // immediately — getPlaybackTime() is frozen, so the condition
              // below can never become true and we'd hang forever.
              if (playbackStateRef.current !== 'playing') {
                clearInterval(id);
                resolve();
                return;
              }
              if (wrapped.timestamp - utilsRef.current.getPlaybackTime() < aheadTarget) {
                clearInterval(id);
                resolve();
              }
            }, 20);
          });
        }
      }
    } catch (e) {
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

      // If a transition is already in progress (e.g. initMediaPlayer auto-play),
      // wait for it to finish instead of rejecting immediately.
      // Add a timeout to prevent deadlocks: if SessionRestorer calls play()
      // while initMediaPlayer is still transitioning, we'd wait forever.
      const deadline = Date.now() + 5000;
      while (playbackStateRef.current === 'transitioning') {
        if (Date.now() > deadline) {
          console.warn('[audio] play(): transition timeout — giving up');
          return;
        }
        await new Promise(r => setTimeout(r, 50));
      }

      // After the transition finishes we may already be playing — no-op.
      if (playbackStateRef.current === 'playing') return;

      // Ensure the video iterator is running. After page reload the AudioContext
      // may have been 'suspended', so initMediaPlayer's auto-play skipped the
      // video iterator. Without it, the canvas never gets frames.
      if (!videoFrameIteratorRef.current && videoSinkRef.current) {
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
    try {
      const wasPlaying = playbackStateRef.current === 'playing';
      await transitionRef.current(wasPlaying ? 'playing' : 'paused', seconds);
    } catch (error) {
      console.error('Seek error:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Seek failed');
    }
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
    console.log('[initMediaPlayer] called with', resource instanceof File ? resource.name : resource);
    try {
      // Stop any current playback before reinitializing.
      if (stopAudioRef.current) {
        await stopAudioRef.current();
      }
      playbackStateRef.current = 'idle';
      peakPlayingSourcesRef.current = 0;
      // Reset audio-locked state — new file means fresh AudioContext
      playerActions.setAudioLocked(false);

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
      soundEffects.triggeredEffectsRef.current.clear();

      // Use BlobSource — reads via Blob.slice() with random access.
      // No sliding-cache problem: canDecode() can seek back freely.
      // Memory: ReadOrchestrator caches only what's actively read (32 MiB max).
      const source = new BlobSource(resource as Blob, { maxCacheSize: 32 * 1024 * 1024 });
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

      // Get sampleRate before creating AudioContext (needed for matching sampleRate)
      const sampleRate = audioTrack ? await audioTrack.getSampleRate() : 48000;

      // Create AudioContext with matching sampleRate — КРИТИЧНО для правильного звука!
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (audioTrack) {
        audioContextRef.current = new AudioContextClass({ sampleRate });

       // Register and create PhaseVocoderNode for pitch-preserving time-stretch
        await PhaseVocoderNode.register(audioContextRef.current, './phase-vocoder-processor.js');

        stNodeRef.current = new PhaseVocoderNode({
          context: audioContextRef.current,
          fftSize: 2048,
          overlapFactor: 4,
          sampleBufferType: 'fifo',
        });

        // Warmup: feed silence into PhaseVocoderNode before any real audio.
        // Without this, FFT windows start as zeros — the silence-to-audio boundary
        // inside the node creates spectral-smearing artifacts ("каша из семплов").
        // 3s at 2x ensures all FFT windows are fully primed with silence.
        // stGain = 0 at 1x, so warmup output is completely inaudible.
        // Fire-and-forget — doesn't block playback.
        (async () => {
          const warmupSamples = Math.ceil(audioContextRef.current!.sampleRate * 3);
          const warmupBuffer = audioContextRef.current!.createBuffer(2, warmupSamples, audioContextRef.current!.sampleRate);
          const warmupSource = audioContextRef.current!.createBufferSource();
          warmupSource.buffer = warmupBuffer;
          warmupSource.playbackRate.setValueAtTime(2, audioContextRef.current!.currentTime);
          warmupSource.connect(stNodeRef.current!);
          warmupSource.start();
          // Wait for warmup to finish (3s of silence at 2x = 1.5s wall-clock)
          await new Promise(r => setTimeout(r, 1600));
        })();

        // Monitor PhaseVocoderNode for underruns (indicates pipeline can't keep up)
        let stReadyStreak = 0; // consecutive checks above target
        stNodeRef.current.addEventListener('metrics', (e: any) => {
          const m = e.detail;
          const delta = m.underrunCount - prevUnderrunsRef.current;
          prevUnderrunsRef.current = m.underrunCount;
          liveUnderrunCountRef.current = m.underrunCount;
          // At 1x PhaseVocoderNode is bypassed (stGain=0) — underruns are harmless
          // noise from a cold FIFO that we don't need to warn about.
          const curSpeed = usePlayerStore.getState().playbackSpeed;
          if (delta > 0 && curSpeed > 1) {
            console.warn(
              `[st-underrun] +${delta} (total=${m.underrunCount}) buffered=${m.framesBuffered} ` +
              `speed=${curSpeed}x`
            );
          }

          // Signal audio-ready when FIFO has enough samples for 2 consecutive checks.
          // Target: 400 frames ≈ 8.3ms at 48kHz. 2 streaks = stability confirmed.
          // Lower target resolves at 1.25x-1.75x without hitting the 2s timeout.
          // With warmup + bridge, this resolves in 50-200ms.
          if (audioReadyResolveRef.current && curSpeed > 1) {
            const target = 400;
            if (m.framesBuffered >= target) {
              stReadyStreak++;
              if (stReadyStreak >= 2) {
                console.log(`[audio] PhaseVocoderNode ready: buffered=${m.framesBuffered} >= ${target} (stable)`);
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

        // Compressor: threshold=-12dB, knee=10, ratio=20, attack=1ms —
        // catches peaks before they reach the limiter. Signal sits around -12dB
        // (gainNode=0.25) so compressor only hits true transients.
        compressorRef.current = audioContextRef.current.createDynamicsCompressor();
        compressorRef.current.threshold.value = -12;
        compressorRef.current.knee.value = 10;
        compressorRef.current.ratio.value = 20;
        compressorRef.current.attack.value = 0.001;
        compressorRef.current.release.value = 0.1;

        // Limiter: brickwall at -0.5dB. ratio=60 + attack=0.5ms prevents
        // any signal from exceeding -0.5dB. knee=2 for smooth onset.
        const limiter = audioContextRef.current.createDynamicsCompressor();
        limiter.threshold.value = -0.5;
        limiter.knee.value = 2;
        limiter.ratio.value = 60;
        limiter.attack.value = 0.0005;
        limiter.release.value = 0.02;
        limiterRef.current = limiter;

        // Analyser for clipping + sand diagnostics — AFTER compressor/limiter
        // so we measure what actually reaches the speaker.
        analyserRef.current = audioContextRef.current.createAnalyser();
        analyserRef.current.fftSize = 4096;

        gainNodeRef.current = audioContextRef.current.createGain();

        // Bypass gain: at 1x, audio goes directly to compressor (0 underruns).
        // stGain: at >1x, audio goes through PhaseVocoderNode.
        // PhaseVocoderNode always receives audio (FIFO stays warm) for seamless transitions.
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

 // Start artifact monitor — extracted to audioMonitor module
        const stopMonitor = startAudioMonitor(
          analyserRef.current,
          audioContextRef.current.sampleRate,
        );
        // Store cleanup on analyser for cleanup() to call later
        (analyserRef.current as any)._stopMonitor = stopMonitor;
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

      // Always start video iterator — draws first frame as preview.
      // Audio only starts if AudioContext is running (autoplay policy).
      if (videoSinkRef.current) {
        await startVideoIteratorRef.current();
      }
      // Auto-play audio if permitted by browser (AudioContext running).
      // The single-gate prevents the speed subscriber from firing its own
      // transition concurrently.
      if (audioContextRef.current?.state === 'running') {
        await transitionRef.current('playing');
      }
    } catch (error) {
      console.error('Error initializing media player:', error);
      playerActions.setError(error instanceof Error ? error.message : 'Failed to load media');
    }
  }, []);

  // === Transcription — extracted to useTranscribe hook ===
  const transcribe = useTranscribe({ audioTrackRef, resourceRef, audioSinkRef });

  const cleanup = useCallback(async () => {
    playerActions.setTranscribing(false);
    playerActions.setIsEnded(false);
    stopTranscribeFocus();

    // Stop audio — same as transition to paused, but we're tearing down everything.
    await stopAudioRef.current();
    playbackStateRef.current = 'idle';

    void videoFrameIteratorRef.current?.return();
    videoFrameIteratorRef.current = null;

    // Clear canvas so the last frame doesn't linger
    if (canvasRef.current && canvasCtxRef.current) {
      canvasCtxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    if (audioContextRef.current) {
      // Stop artifact monitor
      const a = analyserRef.current;
      if (a && (a as any)._stopMonitor) {
        (a as any)._stopMonitor();
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
