# API Reference

## Types (`src/types/index.ts`)

### Core Types

```typescript
type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2 | 2.5 | 3;
type PhaseStatus = 'pending' | 'active' | 'done';
type PackageType = 'free' | 'basic' | 'pro';
type TranscriptionResultTuple = [number, number, string]; // [start, end, text]
```

### Transcription

```typescript
interface TranscriptionWord {
  start: number;           // seconds
  end: number;             // seconds
  text: string;
  confidence?: number;     // 0-1
  speaker?: string;
}
```

### Dictionaries

```typescript
interface Dictionary {
  id: string;
  name: string;
  active: boolean;
  scanner: FastAhoScanner;
}
```

### Censoring Effects

```typescript
interface BasicCensoringEffect {
  startTime: number;
  endTime: number;
  effectType: 'beep' | 'mute' | 'blur' | 'replace';
}

interface SoundCensoringEffect {
  id: string;
  segmentStart: number;            // references transcription row by start time
  soundId: string;                 // references BleepSound
  volume: number;                  // 0-1
  volumeMode: 'manual' | 'auto';   // auto = scaled by RMS
  playbackRate: number;            // bleep playback speed
  dampenOriginal: boolean;         // reduce original audio
  dampenAmount: number;            // 0-1 (1 = silence)
  dampenType: 'sharp' | 'parabolic';
  effectType: 'sound';
}

type CensoringEffect = BasicCensoringEffect | SoundCensoringEffect;
```

### Bleep Sounds

```typescript
interface BleepSound {
  id: string;
  label: string;
  url: string;                     // remote URL (may be empty)
  dataUrl: string;                 // base64 data URL from IndexedDB
  audioBuffer: AudioBuffer | null; // decoded buffer (cached)
}
```

### Export Progress

```typescript
interface ExportPhase {
  key: string;                     // 'collect' | 'bleep' | 'render' | 'codec' | 'encode'
  label: string;
  status: PhaseStatus;
  pct: number;                     // 0-100
  detail: string | null;           // "chunk 203/450 · 1.2s elapsed"
}

interface ExportProgress {
  phases: ExportPhase[];
  elapsed: number;                 // total seconds
}
```

### Player State

```typescript
type PlayerState = {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;                  // 0-1
  isMuted: boolean;
  fileName: string;
  error: string | null;
  warning: string | null;
  isEnded: boolean;
  transcriptionResults: TranscriptionResultTuple[] | null;
  transcribing: boolean;
  transcribeStage: string | null;
  censoringEffects: CensoringEffect[] | null;
  loadedDictionaries: Record<string, Dictionary>;
  activeDictionaries: Set<string>;
  bleepSounds: Record<string, BleepSound>;
  censoringMode: boolean;
  exporting: boolean;
  exportProgress: ExportProgress | null;
  importing: boolean;
  importStage: string | null;
  transcribeFormat: 'wav' | 'original';
  playbackSpeed: number;
  autoScroll: boolean;
};
```

### Auth

```typescript
interface AuthUser {
  id: number;
  tg_user_id: number;
  first_name: string;
  username?: string | null;
  photo_url?: string | null;
  remaining_seconds: number;
  last_free_topup?: string | null;
}
```

## Stores

### playerStore (`src/store/playerStore.ts`)

```typescript
import { usePlayerStore, playerActions, usePlayerActions, hydrateBleepSounds } from './store/playerStore';
```

#### State Access

```typescript
const state = usePlayerStore.getState();
const { isPlaying, currentTime, duration } = state;
```

#### Actions

| Method | Description |
|---|---|
| `playerActions.setIsPlaying(bool)` | Set playing state |
| `playerActions.setCurrentTime(n)` | Set current time |
| `playerActions.setDuration(n)` | Set duration |
| `playerActions.setVolume(n)` | Set volume (0-1) |
| `playerActions.setIsMuted(bool)` | Toggle mute |
| `playerActions.setFileName(string)` | Set loaded file name |
| `playerActions.setError(string \| null)` | Set error message |
| `playerActions.setWarning(string \| null)` | Set warning message |
| `playerActions.setIsEnded(bool)` | Set ended flag |
| `playerActions.setPlaybackSpeed(PlaybackSpeed)` | Set speed |
| `playerActions.setTranscriptionDone(Tuple[])` | Set results + clear transcribing |
| `playerActions.setCensoringEffects(CensoringEffect[])` | Set all effects |
| `playerActions.addSoundEffect(SoundCensoringEffect)` | Add one sound effect |
| `playerActions.removeSoundEffect(id)` | Remove by id |
| `playerActions.updateSoundEffect(id, partial)` | Update by id |
| `playerActions.setCensoringMode(bool)` | Enable/disable censoring during playback |
| `playerActions.loadDictionary(slug, name, scanner)` | Load a dictionary |
| `playerActions.removeDictionary(slug)` | Remove a dictionary |
| `playerActions.toggleDictionary(slug)` | Activate/deactivate |
| `playerActions.clearAllDictionaries()` | Clear all |
| `playerActions.addBleepSound(id, label, url, fileData?)` | Add bleep (persisted to IndexedDB) |
| `playerActions.removeBleepSound(id)` | Remove bleep |
| `playerActions.updateBleepLabel(id, label)` | Rename bleep |
| `playerActions.updateBleepUrl(id, url)` | Change bleep URL |
| `playerActions.setBleepBuffer(id, buffer)` | Cache decoded audio buffer |
| `playerActions.downloadUrlSound(id)` | Download remote sound → store in IndexedDB |
| `playerActions.setExporting(bool)` | Set export flag |
| `playerActions.setExportProgress(ExportProgress \| null)` | Update progress |
| `playerActions.setExportDone()` | Clear export state |
| `playerActions.setImporting(bool)` | Set import flag |
| `playerActions.setImportStage(string \| null)` | Set import stage |
| `playerActions.setImportDone()` | Clear import state |

#### Hydration

```typescript
// On app start — load bleep sounds from IndexedDB
await hydrateBleepSounds();
```

### authStore (`src/store/authStore.ts`)

```typescript
import { useAuthStore } from './store/authStore';
```

| Method | Description |
|---|---|
| `setUser(AuthUser \| null)` | Set user |
| `checkAuth()` | GET `/api/auth/me` — verify session |
| `logout()` | POST `/api/auth/logout` |
| `topup(PackageType)` | POST `/api/plan/topup?package_type=...` |
| `clearError()` | Clear error message |

## Hooks

### useMediaPlayer (`src/hooks/useMediaPlayer.ts`)

Exposed via `MediaPlayerProvider` context. Returns:

| Method | Description |
|---|---|
| `initMediaPlayer(File \| string)` | Initialize player with file or URL |
| `play()` | Start playback |
| `pause()` | Pause playback |
| `togglePlay()` | Toggle |
| `seekToTime(seconds)` | Seek with auto-resume if was playing |
| `setVolume(n)` | Set volume (0-1) |
| `toggleMute()` | Toggle mute |
| `transcribe()` | Start transcription |
| `getPlaybackTime()` | Current media time in seconds |
| `formatSeconds(n)` | Format as MM:SS.mmm |
| `cleanup()` | Destroy player, close AudioContext |
| `getVideoSink()` | MediaBunny CanvasSink |
| `getAudioSink()` | MediaBunny AudioBufferSink |
| `getAudioTrack()` | MediaBunny InputAudioTrack |
| `getVideoTrack()` | MediaBunny InputVideoTrack |
| `getAudioContext()` | Current AudioContext |
| `getInput()` | Current MediaBunny Input |

Refs:
| Ref | Type |
|---|---|
| `canvasRef` | `HTMLCanvasElement` |
| `playerContainerRef` | `HTMLDivElement` |

### Context

```typescript
import { MediaPlayerProvider, useMediaPlayerContext } from './context/MediaPlayerContext';
```

## Config (`src/config.ts`)

```typescript
async function loadBackendUrl(): Promise<string>
function backendPath(path: string): string        // e.g. backendPath('/transcribe')
function backendHeaders(): Record<string, string> // { 'ngrok-skip-browser-warning': 'true' }
function backendWsPath(path: string): string      // WebSocket URL
```

Backend URL is loaded from `../backend-url.json` (written by deploy script). Falls back to `https://192.168.3.250:8686`.

## Audio Utilities (`src/audio.ts`)

```typescript
type WavProgress = (stage: string, done: number, total: number) => void;

async function audioBuffersToWav(
  chunks: AudioBuffer[],
  sampleRate: number,
  onProgress?: WavProgress,
): Promise<Blob>
```

Two-phase WAV encoder: (1) interleave channels, (2) Float32 → Int16 PCM with RIFF header.

## FastAhoScanner (`src/aho-corasick.ts`)

Binary-format Aho-Corasick multi-pattern matcher:

```typescript
// Construct from binary buffer (downloaded from backend /dictionary/<slug>)
const scanner = new FastAhoScanner(arrayBuffer);

// Find matches in text
const matches = scanner.findMatches(text);
// → [{ index: number, state: number }, ...]
```

Binary format: `[nodeCount:u32][nodes:u32+u8 × N][edges:JSON]`

## Export (`src/export.ts`)

```typescript
async function exportCensoredVideo(
  input: Input,
  audioTrack: InputAudioTrack,
  audioSink: AudioBufferSink,
  outputFormat: 'mp4' | 'webm',
  originalVideoCodec?: string | null,
  originalAudioCodec?: string | null,
): Promise<ArrayBuffer>
```

## Bleep Sound Persistence (`src/store/bleepDb.ts`)

IndexedDB operations:

```typescript
function openDb(): Promise<IDBDatabase>
async function getAllBleepRecords(): Promise<DbRecord[]>
async function putBleepRecord(rec: DbRecord): Promise<void>
async function deleteBleepRecord(id: string): Promise<void>
async function updateBleepLabel(id: string, label: string): Promise<void>
async function dbUpdateUrl(id: string, url: string): Promise<void>
async function upsertBleepData(id: string, data: ArrayBuffer): Promise<void>
```

## Bleep Sound I/O (`src/features/bleep-sounds/bleep-sqlite.ts`)

```typescript
async function exportBleepSounds(sounds: Record<string, BleepSound>): Promise<void>
async function importBleepSounds(
  file: File,
  onAdd: (id: string, label: string, url: string, fileData?: ArrayBuffer) => void,
): Promise<number>  // returns count of imported sounds
```

## Auth Utilities (`src/utils/auth.ts`)

```typescript
import { canFreeTopup, daysUntilFreeTopup, formatSeconds } from './utils/auth';

canFreeTopup(lastFreeTopup: string | null | undefined): boolean  // 30+ days since last free topup?
daysUntilFreeTopup(lastFreeTopup: string | null | undefined): number | null  // days remaining
formatSeconds(sec: number): string  // "5h 30m 0s"
```

## PlanCard (`src/features/settings/PlanCard.tsx`)

3D animated plan cards (Free/Basic/Pro). Cards rotate around Y-axis with inertia.

```typescript
import { PlanCard, PLANS } from './settings/PlanCard';

// PLANS — shared array of { type, hours, price, label, description, emoji, accent, bgFront, textGlow }
// Used by both TopupModal and SettingsModal UserContent.

// PlanCard props:
//   plan: Plan
//   disabled: boolean
//   isLoading: boolean
//   onSelect: (type: string) => void
//   delay: number  // ms stagger offset so cards don't spin in sync
```
