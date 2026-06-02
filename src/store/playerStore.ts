import { create } from 'zustand';
import type { PlayerState, Dictionary } from '../types';

export const usePlayerStore = create<PlayerState>((set, get) => ({
  // Playback state
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.7,
  isMuted: false,

  // File state
  fileName: '',
  error: null,
  warning: null,

  // Transcription state
  transcriptionResults: null,
  censoringEffects: null,

  // Dictionary state
  loadedDictionaries: {},
  activeDictionaries: new Set(),

  // Actions
  actions: {
    setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
    setCurrentTime: (currentTime: number) => set({ currentTime }),
    setDuration: (duration: number) => set({ duration }),
    setVolume: (volume: number) => set({ volume }),
    setIsMuted: (isMuted: boolean) => set({ isMuted }),
    setFileName: (fileName: string) => set({ fileName }),
    setError: (error: string | null) => set({ error }),
    setWarning: (warning: string | null) => set({ warning }),
    setTranscriptionResults: (results: Array<[number, number, string]> | null) =>
      set({ transcriptionResults: results }),
    setCensoringEffects: (effects: Array<{
      startTime: number;
      endTime: number;
      effectType: 'beep' | 'mute' | 'blur' | 'replace';
    }> | null) => set({ censoringEffects: effects }),

    // Dictionary actions
    loadDictionary: (slug: string, name: string) => {
      const dict: Dictionary = { id: slug, name, active: true };
      set((state) => ({
        loadedDictionaries: { ...state.loadedDictionaries, [slug]: dict },
        activeDictionaries: new Set([...state.activeDictionaries, slug]),
      }));
    },

    removeDictionary: (slug: string) => {
      const { loadedDictionaries, activeDictionaries } = get();
      const newDictionaries = { ...loadedDictionaries };
      delete newDictionaries[slug];
      const newActive = new Set(activeDictionaries);
      newActive.delete(slug);
      set({ loadedDictionaries: newDictionaries, activeDictionaries: newActive });
    },

    toggleDictionary: (slug: string) => {
      const { activeDictionaries } = get();
      const newActive = new Set(activeDictionaries);
      if (newActive.has(slug)) {
        newActive.delete(slug);
      } else {
        newActive.add(slug);
      }
      set({ activeDictionaries: newActive });
    },

    clearAllDictionaries: () => {
      set({ loadedDictionaries: {}, activeDictionaries: new Set() });
    },
  },
}));
