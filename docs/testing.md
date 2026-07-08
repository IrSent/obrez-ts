# Testing Guide

## Running Tests

```bash
# All e2e tests
bunx playwright test e2e/

# Show report
bunx playwright show-report test-results
```

## Test Suite

| File | Purpose |
|---|---|
| `playback.spec.ts` | Basic play/pause/seek |
| `audio-artifacts.spec.ts` | Artifact detection at all speeds (1x–2x+) |
| `audio-stress.spec.ts` | Stress testing concurrent audio streams |
| `censor-export.spec.ts` | Full censor + export pipeline |
| `click-1x-ru-profanity3.spec.ts` | Click detection at 1x with real content |
| `json-import-export.spec.ts` | Transcription JSON round-trip |
| `multi-segment-race.spec.ts` | Race condition detection with multiple segments |
| `pause-play-diagnostic.spec.ts` | Pause/play cycles with diagnostic checks |
| `sequential-operations.spec.ts` | Sequential operation ordering |
| `sequential-playback.spec.ts` | Sequential playback without overlap |

## Test Fixtures

| File | Purpose |
|---|---|
| `ru-profanity.mp4` | Russian profanity test video |
| `ru-profanity3.mp4` | Russian profanity test video (v3) |
| `valid-with-aac.mp4` | Video with AAC audio track |
| `gong_1.mp3` | Bleep sound test file |
| `valid-with-aac-test.json` | Pre-built transcription + effects JSON |

## Diagnostic Hooks

### `window.__audioDiagnostic`

Updated every 100ms during playback:

```typescript
interface __audioDiagnostic {
  concurrentSources: number;      // total queued BufferSource nodes
  actuallyPlaying: number;        // in "started" state
  peakPlayingSources: number;     // max concurrent ever
  hasIterator: boolean;           // audio iterator exists
  iteratorLocked: boolean;        // runAudioIterator lock held
  playbackState: string;          // 'idle' | 'playing' | 'paused' | 'transitioning'
  getPlaybackTime: number;        // current media time (seconds)
  analyserPeak: number;           // peak amplitude from analyser
  analyserRms: number;           // RMS from analyser
  bypassGain: number | null;     // bypass path gain value
  stGain: number | null;         // PhaseVocoderNode path gain value
}
```

**Key assertions**:
- `peakPlayingSources` should never exceed 2
- `bypassGain = 1, stGain = 0` at 1x (PhaseVocoderNode bypassed)
- `bypassGain = 0, stGain = 1` at >1x (through PhaseVocoderNode)

### `window.__obrezErrors`

Collected by `settings-early.js` — intercepts unhandled promise rejections and errors before React loads. The `DebugButton` (🐛) polls this array.

## Console Diagnostics

During playback, the audio engine logs:

| Prefix | Meaning |
|---|---|
| `[gap]` | Gap between buffers (potential click) |
| `[overlap]` | Buffers overlap (audio played twice) |
| `[st-underrun]` | PhaseVocoderNode FIFO underrun |
| `[output-clip]` | 3+ clipping events in 500ms |
| `[output-click]` | >1% hard clicks or >2% micro-clicks |
| `[output-rip]` | HF burst artifact |
| `[sand]` | Sustained HF noise (PhaseVocoderNode artifact) |
| `[output-blub]` | LF energy spike |

## Playwright Config

Standard Playwright setup at `playwright.config.ts`. Tests run against the dev server (`https://localhost:3000`).
