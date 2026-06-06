import { create } from 'zustand';
import type { PlayerState, Dictionary, BleepSound } from '../types';
import { FastAhoScanner } from '../aho-corasick';

const BLEEP_SOUNDS_KEY = 'obrez-bleep-sounds';

/**
 * Serializable shape stored in localStorage.
 * Audio buffers are not persisted — they are re-hydrated on load.
 */
interface BleepSoundMeta {
  id: string;
  label: string;
  source: 'file' | 'url';
  sourceUrl: string;
}

function loadBleepMeta(): BleepSoundMeta[] {
  try {
    const raw = localStorage.getItem(BLEEP_SOUNDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBleepMeta(meta: BleepSoundMeta[]): void {
  localStorage.setItem(BLEEP_SOUNDS_KEY, JSON.stringify(meta));
}

function metaToSounds(metaList: BleepSoundMeta[]): Record<string, BleepSound> {
  const result: Record<string, BleepSound> = {};
  for (const m of metaList) {
    result[m.id] = { ...m, audioBuffer: null };
  }
  return result;
}

function soundsToMeta(
  sounds: Record<string, BleepSound>,
): BleepSoundMeta[] {
  return Object.values(sounds).map(({ id, label, source, sourceUrl }) => ({
    id,
    label,
    source,
    sourceUrl,
  }));
}

/**
 * Decode an audio source (base64 data or URL) into an AudioBuffer.
 */
async function decodeAudio(
  source: 'file' | 'url',
  sourceUrl: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;

  if (source === 'file') {
    // base64 → binary
    const binary = atob(sourceUrl.split(',')[1] || sourceUrl);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrayBuffer = bytes.buffer;
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  }

  return context.decodeAudioData(arrayBuffer);
}

export const usePlayerStore = create<PlayerState>((set) => ({
  // Playback state
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.5,
  isMuted: false,

  // File state
  fileName: '',
  error: null,
  warning: null,

  // Transcription state
  transcriptionResults: null,
  transcribing: false,
  transcribeStage: null,
  censoringEffects: null,

  // Dictionary state
  loadedDictionaries: {},
  activeDictionaries: new Set(),

  // Bleep sounds
  bleepSounds: metaToSounds(loadBleepMeta()),
}));

/**
 * Actions — вне состояния, чтобы их пересоздание не триггерило
 * ре-рендеры подписчиков. Каждый экшн пишет напрямую через set().
 */
export const playerActions = {
  setIsPlaying: (isPlaying: boolean) => usePlayerStore.setState({ isPlaying }),
  setCurrentTime: (currentTime: number) => usePlayerStore.setState({ currentTime }),
  setDuration: (duration: number) => usePlayerStore.setState({ duration }),
  setVolume: (volume: number) => usePlayerStore.setState({ volume }),
  setIsMuted: (isMuted: boolean) => usePlayerStore.setState({ isMuted }),
  setFileName: (fileName: string) => usePlayerStore.setState({ fileName }),
  setError: (error: string | null) => usePlayerStore.setState({ error }),
  setWarning: (warning: string | null) => usePlayerStore.setState({ warning }),
  setTranscriptionResults: (results: Array<[number, number, string]> | null) =>
    usePlayerStore.setState({ transcriptionResults: results }),
  setTranscribing: (transcribing: boolean) =>
    usePlayerStore.setState({ transcribing }),
  setTranscribeStage: (stage: string | null) =>
    usePlayerStore.setState({ transcribeStage: stage }),
  /**
   * Set transcription results + transcribing=false + clear stage in one setState.
   */
  setTranscriptionDone: (results: Array<[number, number, string]>) =>
    usePlayerStore.setState({
      transcriptionResults: results,
      transcribing: false,
      transcribeStage: null,
    }),
  setCensoringEffects: (effects: Array<{
    startTime: number;
    endTime: number;
    effectType: 'beep' | 'mute' | 'blur' | 'replace';
  }> | null) => usePlayerStore.setState({ censoringEffects: effects }),

  // Dictionary actions
  loadDictionary: (slug: string, name: string, scanner: FastAhoScanner) => {
    const dict: Dictionary = { id: slug, name, active: true, scanner };
    usePlayerStore.setState((state) => ({
      loadedDictionaries: { ...state.loadedDictionaries, [slug]: dict },
      activeDictionaries: new Set([...state.activeDictionaries, slug]),
    }));
  },

  removeDictionary: (slug: string) => {
    const state = usePlayerStore.getState();
    const newDictionaries = { ...state.loadedDictionaries };
    delete newDictionaries[slug];
    const newActive = new Set(state.activeDictionaries);
    newActive.delete(slug);
    usePlayerStore.setState({ loadedDictionaries: newDictionaries, activeDictionaries: newActive });
  },

  toggleDictionary: (slug: string) => {
    const { activeDictionaries } = usePlayerStore.getState();
    const newActive = new Set(activeDictionaries);
    if (newActive.has(slug)) {
      newActive.delete(slug);
    } else {
      newActive.add(slug);
    }
    usePlayerStore.setState({ activeDictionaries: newActive });
  },

  clearAllDictionaries: () => {
    usePlayerStore.setState({ loadedDictionaries: {}, activeDictionaries: new Set() });
  },

  // Bleep sound actions

  addBleepSound: (id: string, label: string, source: 'file' | 'url', sourceUrl: string) => {
    const sound: BleepSound = { id, label, source, sourceUrl, audioBuffer: null };
    usePlayerStore.setState((state) => {
      const newSounds = { ...state.bleepSounds, [id]: sound };
      saveBleepMeta(soundsToMeta(newSounds));
      return { bleepSounds: newSounds };
    });
  },

  removeBleepSound: (id: string) => {
    usePlayerStore.setState((state) => {
      const newSounds = { ...state.bleepSounds };
      delete newSounds[id];
      saveBleepMeta(soundsToMeta(newSounds));
      return { bleepSounds: newSounds };
    });
  },

  updateBleepLabel: (id: string, label: string) => {
    usePlayerStore.setState((state) => {
      const sound = state.bleepSounds[id];
      if (!sound) return {};
      const updated = { ...sound, label };
      const newSounds = { ...state.bleepSounds, [id]: updated };
      saveBleepMeta(soundsToMeta(newSounds));
      return { bleepSounds: newSounds };
    });
  },

  setBleepBuffer: (id: string, buffer: AudioBuffer | null) => {
    usePlayerStore.setState((state) => {
      const sound = state.bleepSounds[id];
      if (!sound) return {};
      return { bleepSounds: { ...state.bleepSounds, [id]: { ...sound, audioBuffer: buffer } } };
    });
  },
};

/**
 * Хук для удобного доступа к экшнам из компонентов.
 * Возвращает стабильную ссылку — не ломает useCallback-зависимости.
 */
export function usePlayerActions() {
  return playerActions;
}
