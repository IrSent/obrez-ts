import { FastAhoScanner } from '../aho-corasick';

/**
 * Represents a single word in a transcription with timing information
 */
export interface TranscriptionWord {
  /** Start time of the word in seconds */
  start: number;

  /** End time of the word in seconds */
  end: number;

  /** The text content of the word */
  text: string;

  /** Optional confidence score (0-1) */
  confidence?: number;

  /** Optional speaker identifier */
  speaker?: string;
}

/**
 * Represents a dictionary for word matching
 */
export interface Dictionary {
  /** Unique identifier for the dictionary */
  id: string;

  /** Display name of the dictionary */
  name: string;

  /** Whether the dictionary is currently active */
  active: boolean;

  /** Aho-Corasick scanner built from the dictionary data */
  scanner: FastAhoScanner;
}

/**
 * Represents a basic censoring effect (mute, blur, replace, beep).
 * Times are in seconds (matches transcription timestamps).
 */
export interface BasicCensoringEffect {
  startTime: number;
  endTime: number;
  effectType: 'beep' | 'mute' | 'blur' | 'replace';
}

/**
 * A sound effect attached to a transcription segment.
 * segmentStart references the transcription row by its start time.
 * The end time is derived from the transcription results at runtime.
 */
export interface SoundCensoringEffect {
  id: string;
  segmentStart: number;
  soundId: string;
  volume: number;
  volumeMode: 'manual' | 'auto';
  playbackRate: number;
  dampenOriginal: boolean;
  dampenAmount: number;
  dampenType: 'sharp' | 'parabolic';
  effectType: 'sound';
}

export type CensoringEffect = BasicCensoringEffect | SoundCensoringEffect;

/**
 * Transcription result tuple for backward compatibility with the backend
 */
export type TranscriptionResultTuple = [number, number, string];

/**
 * Represents a sound available for censoring (bleep / beep)
 */
export interface BleepSound {
  /** Unique identifier */
  id: string;

  /** Display label */
  label: string;

  /** Original URL — may be empty if sound was added from disk */
  url: string;

  /** base64 data URL (data:audio/*;base64,...) — set when the blob is stored in IndexedDB */
  dataUrl: string;

  /** Decoded audio buffer — null while loading */
  audioBuffer: AudioBuffer | null;
}

/**
 * Phase status in export progress.
 */
export type PhaseStatus = 'pending' | 'active' | 'done';

/**
 * A single phase of the export pipeline.
 */
export interface ExportPhase {
  /** Phase key (used for matching) */
  key: string;

  /** Human-readable label */
  label: string;

  /** Current status */
  status: PhaseStatus;

  /** Progress 0–100 (meaningful only when status === 'active' or 'done') */
  pct: number;

  /** Sub-detail text (e.g. "chunk 203/450 · 1.2s elapsed") */
  detail: string | null;
}

/**
 * Structured export progress — replaces the old flat exportStage string.
 */
export interface ExportProgress {
  /** All phases of the export pipeline */
  phases: ExportPhase[];

  /** Total elapsed time in seconds since export started */
  elapsed: number;
}

/**
 * Represents the state of the media player
 */
export type PlayerState = {
  /** Whether the media is currently playing */
  isPlaying: boolean;

  /** Current playback time in seconds */
  currentTime: number;

  /** Total duration of the media in seconds */
  duration: number;

  /** Volume level (0-1) */
  volume: number;

  /** Whether the audio is muted */
  isMuted: boolean;

  /** Name of the currently loaded file */
  fileName: string;

  /** Error message if any */
  error: string | null;

  /** Warning message if any */
  warning: string | null;

  /** Whether playback has reached the end */
  isEnded: boolean;

  /** Transcription results if available */
  transcriptionResults: Array<TranscriptionResultTuple> | null;

  /** Whether transcription is currently processing on the backend */
  transcribing: boolean;

  /** Current transcription stage for UI visualization */
  transcribeStage: string | null;

  /** Censoring effects if available */
  censoringEffects: Array<CensoringEffect> | null;

  /** Loaded dictionaries by slug */
  loadedDictionaries: Record<string, Dictionary>;

  /** Active dictionary slugs */
  activeDictionaries: Set<string>;

  /** Available bleep sounds for censoring */
  bleepSounds: Record<string, BleepSound>;

  /** Whether censoring effects are active during playback */
  censoringMode: boolean;

  /** Whether video export is in progress */
  exporting: boolean;

  /** Structured export progress for phase-by-phase UI display */
  exportProgress: ExportProgress | null;

  /** Whether JSON import is in progress */
  importing: boolean;

  /** Current import stage for progress display */
  importStage: string | null;

  /** Audio format to send for transcription: 'wav' (PCM uncompressed) or 'original' (raw compressed packets, no re-encoding) */
  transcribeFormat: 'wav' | 'original';

  /** Playback speed multiplier (1 = normal, 1.5 = 1.5x, etc.) */
  playbackSpeed: number;

  /** Whether transcription results panel auto-scrolls on playback */
  autoScroll: boolean;
};

/**
 * Available playback speed options.
 */
export type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2 | 2.5 | 3;

/**
 * Authenticated user from Telegram
 */
export interface AuthUser {
  id: number;
  tg_user_id: number;
  first_name: string;
  username?: string | null;
  photo_url?: string | null;
  remaining_seconds: number;
  last_free_topup?: string | null;
}

/**
 * Hour pack types for topping up transcription hours
 */
export type HourPackType = 'free' | 'basic' | 'pro';
