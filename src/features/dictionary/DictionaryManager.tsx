import { useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { FastAhoScanner } from '../../aho-corasick';

export const DictionaryManager = () => {
  const { loadedDictionaries, activeDictionaries, actions } = usePlayerStore();
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});

  const handleAddDictionary = async () => {
    const slug = prompt('Enter dictionary slug:');
    if (!slug) return;

    if (slug in loadedDictionaries) {
      alert('Dictionary already loaded: ' + slug);
      return;
    }

    setIsLoading((prev) => ({ ...prev, [slug]: true }));

    try {
      const response = await fetch(`http://localhost:8686/dictionary/${slug}`);
      if (!response.ok) {
        alert(`Dictionary not found: ${slug}`);
        return;
      }

      const buffer = await response.arrayBuffer();
      new FastAhoScanner(buffer); // Validate that the buffer is a valid dictionary

      actions.loadDictionary(slug, slug);
    } catch (error) {
      console.error('Error loading dictionary:', error);
      alert('Failed to load dictionary: ' + (error as Error).message);
    } finally {
      setIsLoading((prev) => ({ ...prev, [slug]: false }));
    }
  };

  const handleToggleDictionary = (slug: string) => {
    actions.toggleDictionary(slug);
  };

  const handleRemoveDictionary = (slug: string) => {
    actions.removeDictionary(slug);
  };

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Dictionaries</h2>

      <button
        onClick={handleAddDictionary}
        disabled={Object.values(isLoading).some((v) => v)}
        className="w-full text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded transition-colors mb-3 disabled:opacity-50"
      >
        {Object.values(isLoading).some((v) => v) ? 'Loading...' : '+ Load Dictionary'}
      </button>

      {Object.keys(loadedDictionaries).length > 0 ? (
        <div className="space-y-2">
          {Object.entries(loadedDictionaries).map(([slug, dict]) => (
            <div
              key={slug}
              className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-zinc-700"
            >
              <span className="truncate">{dict.name}</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleToggleDictionary(slug)}
                  className="p-1 rounded hover:bg-zinc-600"
                  aria-label={activeDictionaries.has(slug) ? 'Deactivate' : 'Activate'}
                >
                  {activeDictionaries.has(slug) ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 8l8-8-8-8-8 8 8 8z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleRemoveDictionary(slug)}
                  className="p-1 rounded hover:bg-zinc-600"
                  aria-label="Remove"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 py-2">No dictionaries loaded</div>
      )}
    </div>
  );
};
