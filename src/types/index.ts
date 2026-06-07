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
 * Represents a censoring effect to be applied to a video segment
 */
export interface CensoringEffect {
  /** Start time of the effect in milliseconds */
  startTime: number;

  /** End time of the effect in milliseconds */
  endTime: number;

  /** Type of censoring effect */
  effectType: 'beep' | 'mute' | 'blur' | 'replace';
}

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
};
