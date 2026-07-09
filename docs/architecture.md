# Architecture Overview

## High-Level Design

Obrez is a **client-first** video censorship tool. All media processing — decoding, rendering, encoding — happens in the browser via [MediaBunny](https://mediabunny.dev/). The backend (GigaAM) is only used for **transcription** (speech-to-text) and **authentication** (Telegram OIDC + PKCE).

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ FileLoad │→ │ Media    │→ │ Transcrip-│→ │ Export     │  │
│  │ er       │  │ Player   │  │ tion/     │  │ Pipeline   │  │
│  │          │  │ (rAF +   │  │ Censoring │  │ (MediaBunny│  │
│  │          │  │  WebAudio│  │ Effects   │  │  Conversion│  │
│  │          │  │ )        │  │           │  │ )          │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│       │              │              │              │         │
│       └──────────────┴──────────────┴──────────────┘         │
│                         │                                    │
│                   Zustand                                   │
│                   (playerStore,                               │
│                    authStore)                                 │
└─────────────────────────┼────────────────────────────────────┘
                          │ fetch / WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                     GigaAM Backend                           │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Telegram     │  │ Transcription│  │ Dictionary        │  │
│  │ Auth (HMAC)  │  │ (Whisper)    │  │ API               │  │
│  │ JWT + Cookie │  │ WebSocket    │  │ (binary Aho-      │  │
│  │              │  │              │  │  Corasick)        │  │
│  └──────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| UI | React 19 + JSX |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Media | MediaBunny (WebCodecs) |
| Audio | PhaseVocoderNode (`@soundtouchjs/phase-vocoder-worklet`) |
| Dict matching | Custom Aho-Corasick (`FastAhoScanner`) |
| Persistence | IndexedDB (bleep sounds) |
| E2E Testing | Playwright |
| Backend | FastAPI (GigaAM, separate repo) |

## Core Abstractions (God Nodes)

These are the most-connected parts of the system:

| Node | Edges | Role |
|---|---|---|
| `usePlayerStore` | 26 | Central state hub — playback, transcription, dictionaries, bleep sounds, export |
| `useMediaPlayerContext()` | 16 | Provides media player instance to all UI components via React Context |
| `usePlayerActions()` | 13 | Stable action dispatcher — writes directly to Zustand store |
| `FastAhoScanner` | 11 | Multi-pattern string matcher for dictionary-based word detection |
| `WritableBuffer` | 10 | Shared growable audio buffer between export collector and renderer |
| `exportCensoredVideo()` | 10 | Orchestrates the full export pipeline |

## State Management

### Zustand Stores

**`playerStore`** (`src/store/playerStore.ts`) — single source of truth for all app state:
- Playback (isPlaying, currentTime, duration, volume, speed)
- File (fileName, error, warning)
- Transcription (results, stage, effects)
- Dictionaries (loaded, active)
- Bleep sounds (persisted to IndexedDB)
- Export (progress by phase)

**`authStore`** (`src/store/authStore.ts`) — user session:
- `user: AuthUser | null`
- `checkAuth()` → GET `/api/auth/me` with `credentials: 'include'`
- `topup(packageType)` → POST `/api/plan/topup`
- `logout()` → POST `/api/auth/logout`

### Action Pattern

Actions are **outside** the Zustand state shape. `playerActions` is a plain object that writes directly via `usePlayerStore.setState()`. This prevents subscriber re-renders when action references would otherwise change.

```typescript
// Stable reference — safe in useCallback deps
export const playerActions = {
  setIsPlaying: (v) => usePlayerStore.setState({ isPlaying: v }),
  addSoundEffect: (effect) => { /* ... */ },
  // ...
};

export function usePlayerActions() {
  return playerActions; // same reference always
}
```

## Component Tree

```
App
├── MediaPlayerProvider          ← React Context for media player
│   ├── Header (sticky)
│   │   ├── Logo + Title
│   │   ├── HeaderExportButton   ← export progress badge
│   │   ├── DebugButton          ← 🐛 aggregates auth + player + JS errors
│   │   └── ⚙️ → SettingsModal
│   ├── FileLoader               ← drop file or URL
│   ├── PlayerDisplay            ← canvas + controls
│   │   ├── ProgressBar
│   │   ├── VolumeControls
│   │   └── Speed selector
│   ├── TranscriptionResults     ← react-window list
│   │   ├── EffectModal          ← add/edit sound effects
│   │   ├── AddWordModal         ← manual transcription entry
│   │   └── Auth modals (Login, Topup, Confirmation)
│   └── ExportButton             ← sidebar (desktop)
└── SettingsModal                ← 👤📚🔊🔄 (Account, Dictionaries, Bleep Sounds, Version)
```

### PlanCard

`src/features/settings/PlanCard.tsx` — 3D animated cards for subscription plans (Free/Basic/Pro). Cards rotate around the Y-axis with inertia (fast spin, deceleration, linger at front face). Shared between `TopupModal` and `SettingsModal` UserContent via the `PLANS[]` export.

## Data Flow

### Playback

1. `FileLoader` → `initMediaPlayer(file)` → MediaBunny `Input` + `AudioBufferSink` + `CanvasSink`
2. `runAudioIterator` feeds `WrappedAudioBuffer` → Web Audio nodes → `PhaseVocoderNode` → output
3. `updateNextFrame` feeds `WrappedCanvas` → `<canvas>` draw
4. rAF loop drives frame rendering and progress bar updates
5. All state changes routed through `playerActions`

### Transcription

1. User clicks "Transcribe" → `checkAuth()` → if not logged in, show `LoginModal`
2. Audio collected via `AudioBufferSink.buffers(0)` (or remuxed to MP4 in `original` mode)
3. POST to backend `/transcribe` with `FormData`
4. WebSocket to `/ws/status/{task_id}` for live progress
5. Results stored in `playerStore.transcriptionResults` as `[start, end, text][]`

### Censoring

1. User marks transcription rows → `SoundCensoringEffect` added via `playerActions.addSoundEffect()`
2. During playback, `checkSoundEffects()` triggers bleep sounds + dampens original audio via Web Audio GainNode
3. During export, `renderSegment()` applies effects via `OfflineAudioContext`

## Workers

| Worker | Purpose |
|---|---|
| `censor-worker.ts` | Renders censored audio via `OfflineAudioContext` off the main thread |
| `search.worker.ts` | Runs `FastAhoScanner` dictionary matching in a worker |
| `json-import.worker.ts` | Imports transcription JSON files |
| `json-export.worker.ts` | Exports transcription JSON files |

## Key Design Principles

1. **Single transition gate** — `transitionRef` is the only way to change playback state. Prevents concurrent stop/start.
2. **Quality over seamlessness** — full stop on speed change, 100-200ms pause is better than audio artifacts.
3. **Actions outside state** — stable references for `useCallback` dependency arrays.
4. **Cache-bust via content hash** — `settings-early.js` and `settings-ui.js` use MD5 filenames to bypass CDN caching.
