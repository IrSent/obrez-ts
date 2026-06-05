import { create } from 'zustand';
import type { PlayerState, Dictionary } from '../types';
import { FastAhoScanner } from '../aho-corasick';

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
  censoringEffects: null,

  // Dictionary state
  loadedDictionaries: {},
  activeDictionaries: new Set(),
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
};

/**
 * Хук для удобного доступа к экшнам из компонентов.
 * Возвращает стабильную ссылку — не ломает useCallback-зависимости.
 */
export function usePlayerActions() {
  return playerActions;
}
