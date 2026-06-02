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

  /** Transcription results if available */
  transcriptionResults: Array<TranscriptionResultTuple> | null;

  /** Censoring effects if available */
  censoringEffects: Array<CensoringEffect> | null;

  /** Loaded dictionaries by slug */
  loadedDictionaries: Record<string, Dictionary>;

  /** Active dictionary slugs */
  activeDictionaries: Set<string>;

  /** Actions for updating the store */
  actions: {
    setIsPlaying: (isPlaying: boolean) => void;
    setCurrentTime: (currentTime: number) => void;
    setDuration: (duration: number) => void;
    setVolume: (volume: number) => void;
    setIsMuted: (isMuted: boolean) => void;
    setFileName: (fileName: string) => void;
    setError: (error: string | null) => void;
    setWarning: (warning: string | null) => void;
    setTranscriptionResults: (results: Array<TranscriptionResultTuple> | null) => void;
    setCensoringEffects: (effects: Array<CensoringEffect> | null) => void;
    loadDictionary: (slug: string, name: string) => void;
    removeDictionary: (slug: string) => void;
    toggleDictionary: (slug: string) => void;
    clearAllDictionaries: () => void;
  };
};
