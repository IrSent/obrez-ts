# Audio Engine

## Overview

The audio engine is the most complex part of Obrez. It handles:
- Decoding video audio tracks via MediaBunny
- Variable-speed playback with pitch preservation (0.5x–3x)
- Real-time sound effect triggering (bleep sounds)
- Audio quality monitoring (artifact detection)

## PhaseVocoderNode

### What it does

Pitch-preserving time-stretch using FFT-based phase vocoding. At `speed > 1x`, audio is played faster without the chipmunk effect.

### Configuration

```typescript
const stNode = new PhaseVocoderNode({
  context: audioContext,
  fftSize: 2048,        // ~42.7ms latency at 48kHz
  overlapFactor: 4,
  sampleBufferType: 'fifo',
});
```

### Dual-Path Gain Routing

Audio flows through **two parallel paths** that are crossfaded based on playback speed:

```
source ──→ bypassGain ──┐
                        ├──→ compressor → limiter → analyser → gain → destination
source ──→ stNode ──→ stGain ─┘

At 1x:   bypassGain = 1, stGain = 0  (no PhaseVocoderNode, zero artifacts)
At >1x:  bypassGain = 0, stGain = 1  (through PhaseVocoderNode)
```

This means at 1x speed, the PhaseVocoderNode is completely bypassed — no FFT artifacts, no latency.

### How speed-up works

1. `source.playbackRate = speed` — feeds audio faster into the pipeline (chipmunk effect)
2. `stNode.playbackRate = speed` — PhaseVocoderNode stretches the signal back, restoring pitch
3. Net result: faster playback, normal pitch

## State Machine

```
idle ──→ playing ←──→ paused
          ↑   ↓
    transitioning  (guard — blocks all other transitions)
```

**`transitionRef`** is the single entry point for all state changes:

```typescript
await transitionRef.current('playing');   // play
await transitionRef.current('paused');    // pause
await transitionRef.current('playing', 10); // seek to 10s and play
```

### Transition sequence

```
1. Guard: reject if 'transitioning'
2. Guard: no-op if already in target state (no seek)
3. Set state → 'transitioning'
4. stopAudio() if was playing:
   a. Read current time from AudioContext (using current speed for accuracy)
   b. Set abortAudioRef = true
   c. await iterator.return() (with 500ms timeout)
   d. Wait for runAudioIterator lock to release (150 attempts × 20ms = 3s max)
   e. Stop all queued BufferSource nodes with stop(0)
   f. Wait 10ms for audio thread to silence
5. Seek if needed: update playbackTimeAtStartRef, restart video iterator
6. startAudio() if target = 'playing':
   a. Wait for old iterator lock release
   b. Increment audioGenerationRef (defense against stale iterators)
   c. Create new audioBufferIterator
   d. Bootstrap silence at >1x (wait for FIFO fill via metrics event)
   e. Wait for first buffer scheduled
   f. Set state → 'playing'
7. Error recovery: if state still 'transitioning', fall back to 'paused'
```

## Race Condition Defense

Three layers prevent overlapping audio from concurrent iterators:

### Layer 1: `abortAudioRef`

Set `true` by `stopAudio()` **before** `iterator.return()`. The running iterator checks this on every loop iteration and exits immediately.

### Layer 2: `audioGenerationRef`

Incremented by `startAudio()` **after** the old iterator is dead. The new iterator captures the generation; any stale iterator that resumes sees a mismatch and exits.

### Layer 3: `runAudioIteratorLockRef`

Prevents two iterators from running simultaneously. `startAudio()` waits for the lock before creating a new iterator.

## Bootstrap and Warmup

### Warmup (at init)

3 seconds of silence at 2x fed into PhaseVocoderNode on startup. This pre-fills the FIFO so FFT windows are not cold (all zeros). Without warmup, the silence-to-audio boundary inside the node creates spectral smearing artifacts.

```typescript
// Fire-and-forget — doesn't block playback
(async () => {
  const warmupSamples = Math.ceil(ctx.sampleRate * 3);
  const warmupBuffer = ctx.createBuffer(2, warmupSamples, ctx.sampleRate);
  const warmupSource = ctx.createBufferSource();
  warmupSource.buffer = warmupBuffer;
  warmupSource.playbackRate.setValueAtTime(2, ctx.currentTime);
  warmupSource.connect(stNode);
  warmupSource.start();
  await new Promise(r => setTimeout(r, 1600));
})();
```

### Bootstrap (at each startAudio)

At `speed > 1x`, `BOOTSTRAP_MS = ceil(400 * speed)` ms of silence is fed before real audio. This ensures the PhaseVocoderNode FIFO has enough samples. At 1x, bootstrap is **zero** — audio goes through bypassGain directly.

### Bridge Silence (at speed transition)

800ms of silence at the new speed, started **before** `stopAudio()`. This keeps the PhaseVocoderNode FIFO fed during the stop→start gap.

## Audio Quality Monitoring

### Compressor + Limiter Chain

```
compressor: threshold=-12dB, knee=10, ratio=20, attack=1ms, release=100ms
limiter:    threshold=-0.5dB, knee=2, ratio=60, attack=0.5ms, release=20ms
analyser:   fftSize=4096
```

### Artifact Detection (every 50ms)

| Artifact | Detection | Threshold |
|---|---|---|
| **Clip** | Peak ≥ 0.99 in time domain | 3 occurrences in 500ms |
| **Click** | Consecutive sample delta > 0.5 | > 1% of waveform |
| **Micro-click** | Delta > 0.35 | > 2% of waveform |
| **Rip (HF burst)** | HF energy ratio (4-8kHz) > 0.40 | speed > 1x only |
| **Rip (mid-range)** | Mid energy ratio (1-4kHz) > 0.55 | speed > 1x only |
| **Sand** | HF ratio > 0.35 AND spectral flatness > 0.6 | speed > 1x only |
| **Blub** | LF ratio (80-300Hz) > 0.6 | speed > 1x only |
| **HF jump** | Delta between consecutive HF ratio > 0.15 | speed > 1x only |

All detections log to the console with `[output-*]` prefixes. At 1x, only clip and click detection run — PhaseVocoderNode artifacts don't exist at 1x.

## Buffer Scheduling

### Chain Strategy

Each `BufferSource` starts exactly when the previous one ends — no gap, no overlap:

```
[bootstrap][buffer1][buffer2][buffer3]...
  └──lastEnd────────────┘
```

### actualEndCorrection

`onended` fires ~1 render quantum (3ms) before the node is truly silent on the Web Audio render thread. The engine tracks the actual end time via `onended` and uses it to set `lastEnd` for the next buffer, eliminating gaps caused by mid-buffer speed changes.

### Periodic Yield

Every 30 buffers (~1s of audio), the iterator yields to the event loop (`await setTimeout(0)`) so the rAF video render loop isn't starved.

### Backpressure

The iterator keeps 2s ahead at `>1x` and 4s ahead at `1x` (MediaBunny can be slow — larger buffer prevents gaps). When too far ahead, it waits until the gap closes.

## Sound Effect Engine

### During Playback

`checkSoundEffects(playbackTime)` scans all `SoundCensoringEffect`s on each rAF frame:

1. If the effect hasn't been triggered yet (`triggeredEffectsRef` doesn't contain the id)
2. And the current playback time is within the effect's transcription segment
3. → `triggerSoundEffect(effect, segmentEnd)`:
   - Play the bleep sound (BufferSource with configured rate + volume)
   - Dampen original audio via `gainNode` (sharp or parabolic)

### Dampening Types

- **Sharp**: immediate gain drop, hold, immediate restore at segment end
- **Parabolic**: smooth dip via `setTargetAtTime` with tau = 30% of segment duration

## E2E Diagnostics

`window.__audioDiagnostic` exposes live state to Playwright:

```typescript
interface __audioDiagnostic {
  concurrentSources: number;      // total queued BufferSource nodes
  actuallyPlaying: number;        // in "started" state
  peakPlayingSources: number;     // max concurrent (should never > 2)
  hasIterator: boolean;           // iterator exists
  iteratorLocked: boolean;        // runAudioIterator lock
  playbackState: string;          // 'idle' | 'playing' | 'paused' | 'transitioning'
  getPlaybackTime: number;        // current media time
  analyserPeak: number;           // peak amplitude
  analyserRms: number;           // RMS
  bypassGain: number | null;     // bypass path gain
  stGain: number | null;         // PhaseVocoderNode path gain
}
```
