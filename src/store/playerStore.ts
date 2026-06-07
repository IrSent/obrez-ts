import { create } from 'zustand';
import type { PlayerState, Dictionary, BleepSound } from '../types';
import { FastAhoScanner } from '../aho-corasick';
import { getAllBleepRecords, putBleepRecord, deleteBleepRecord, updateBleepLabel as dbUpdateLabel, upsertBleepData, dbUpdateUrl } from './bleepDb';

/**
 * Convert IndexedDB records to BleepSound map.
 */
function recordsToSounds(records: Awaited<ReturnType<typeof getAllBleepRecords>>): Record<string, BleepSound> {
  const result: Record<string, BleepSound> = {};
  for (const rec of records) {
    if (rec.data) {
      // Convert ArrayBuffer to base64 data URL for in-memory use
      const bytes = new Uint8Array(rec.data);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      result[rec.id] = {
        id: rec.id,
        label: rec.label,
        url: rec.url ?? '',
        dataUrl: `data:audio/*;base64,${base64}`,
        audioBuffer: null,
      };
    } else {
      // No blob data — rely on URL
      result[rec.id] = {
        id: rec.id,
        label: rec.label,
        url: rec.url ?? '',
        dataUrl: '',
        audioBuffer: null,
      };
    }
  }
  return result;
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
  isEnded: false,

  // Transcription state
  transcriptionResults: null,
  transcribing: false,
  transcribeStage: null,
  censoringEffects: null,

  // Dictionary state
  loadedDictionaries: {},
  activeDictionaries: new Set(),

  // Bleep sounds — loaded async from IndexedDB
  bleepSounds: {},
}));

/**
 * Hydrate bleep sounds from IndexedDB on app start.
 */
export async function hydrateBleepSounds(): Promise<void> {
  try {
    const records = await getAllBleepRecords();
    const sounds = recordsToSounds(records);
    usePlayerStore.setState({ bleepSounds: sounds });
  } catch (err) {
    console.error('Failed to hydrate bleep sounds:', err);
  }
}

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
  setIsEnded: (isEnded: boolean) => usePlayerStore.setState({ isEnded }),
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

  addBleepSound: async (
    id: string,
    label: string,
    remoteUrl: string,
    fileData?: ArrayBuffer,
  ) => {
    // Persist to IndexedDB
    if (fileData) {
      // File sound — store blob; also preserve url if provided (e.g. from SQLite import)
      await putBleepRecord({ id, label, url: remoteUrl || undefined, data: fileData });
    } else {
      // URL sound — store remote URL
      await putBleepRecord({ id, label, url: remoteUrl });
    }

    // Update in-memory store
    let sound: BleepSound;
    if (fileData) {
      // Convert ArrayBuffer to base64 data URL for in-memory playback
      const bytes = new Uint8Array(fileData);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      sound = {
        id,
        label,
        url: remoteUrl || '',
        dataUrl: `data:audio/*;base64,${base64}`,
        audioBuffer: null,
      };
    } else {
      sound = {
        id,
        label,
        url: remoteUrl,
        dataUrl: '',
        audioBuffer: null,
      };
    }
    usePlayerStore.setState((state) => ({
      bleepSounds: { ...state.bleepSounds, [id]: sound },
    }));
  },

  removeBleepSound: async (id: string) => {
    await deleteBleepRecord(id);
    usePlayerStore.setState((state) => {
      const newSounds = { ...state.bleepSounds };
      delete newSounds[id];
      return { bleepSounds: newSounds };
    });
  },

  updateBleepLabel: async (id: string, label: string) => {
    await dbUpdateLabel(id, label);
    usePlayerStore.setState((state) => {
      const sound = state.bleepSounds[id];
      if (!sound) return {};
      return { bleepSounds: { ...state.bleepSounds, [id]: { ...sound, label } } };
    });
  },

  updateBleepUrl: async (id: string, url: string) => {
    await dbUpdateUrl(id, url);
    usePlayerStore.setState((state) => {
      const sound = state.bleepSounds[id];
      if (!sound) return {};
      return { bleepSounds: { ...state.bleepSounds, [id]: { ...sound, url } } };
    });
  },

  setBleepBuffer: (id: string, buffer: AudioBuffer | null) => {
    usePlayerStore.setState((state) => {
      const sound = state.bleepSounds[id];
      if (!sound) return {};
      return { bleepSounds: { ...state.bleepSounds, [id]: { ...sound, audioBuffer: buffer } } };
    });
  },

  /**
   * Download a sound's audio blob from its URL and store it in IndexedDB.
   * After this, the sound no longer depends on the remote URL.
   */
  downloadUrlSound: async (id: string) => {
    const sound = usePlayerStore.getState().bleepSounds[id];
    if (!sound || !sound.url) return;

    try {
      const res = await fetch(sound.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();

      // Store blob in IndexedDB
      await upsertBleepData(id, arrayBuffer);

      // Convert to base64 data URL for in-memory use
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64 = btoa(binary);
      const dataUrl = `data:audio/*;base64,${base64}`;

      usePlayerStore.setState((state) => {
        const s = state.bleepSounds[id];
        if (!s) return {};
        return { bleepSounds: { ...state.bleepSounds, [id]: { ...s, dataUrl } } };
      });
    } catch (err) {
      console.error(`Failed to download sound ${id}:`, err);
      throw err;
    }
  },
};

/**
 * Хук для удобного доступа к экшнам из компонентов.
 * Возвращает стабильную ссылку — не ломает useCallback-зависимости.
 */
export function usePlayerActions() {
  return playerActions;
}
