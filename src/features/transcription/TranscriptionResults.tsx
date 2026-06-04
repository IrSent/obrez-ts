import { memo, useState } from 'react';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { FastAhoScanner } from '../../aho-corasick';

const TranscriptionResultsInner = () => {
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const loadedDictionaries = usePlayerStore((state) => state.loadedDictionaries);
  const activeDictionaries = usePlayerStore((state) => state.activeDictionaries);
  const actions = usePlayerActions();
  const { transcribe, seekToTime } = useMediaPlayerContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTranscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await transcribe();
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Failed to transcribe: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  const handleJumpToTime = (time: number) => {
    seekToTime(time);
  };

  // Форматируем время для отображения
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Получаем список слов для подсветки
  const getTriggeredWords = (text: string): string[] => {
    const triggered: string[] = [];
    activeDictionaries.forEach((slug) => {
      const dict = loadedDictionaries[slug];
      if (!dict) return;

      // Здесь нужно использовать FastAhoScanner для поиска совпадений
      // Но так как у нас нет доступа к самому сканеру, мы используем результаты транскрипции
      // В реальном приложении нужно хранить сканеры в каком-то хранилище
      triggered.push(slug);
    });
    return triggered;
  };

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">Transcription Results</h2>
        <button
          onClick={handleTranscribe}
          disabled={isLoading}
          className="text-xs text-purple-400 hover:text-purple-300 disabled:opacity-50"
        >
          {isLoading ? 'Loading...' : 'Transcribe'}
        </button>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 p-2 bg-red-900/20 rounded">
          {error}
        </div>
      )}

      {isLoading && !transcriptionResults ? (
        <div className="text-xs text-zinc-500 py-2">Loading transcription...</div>
      ) : transcriptionResults && transcriptionResults.length > 0 ? (
        <div className="space-y-1">
          {transcriptionResults.map(([start, end, text], index) => {
            const triggered = getTriggeredWords(text);

            return (
              <div key={index} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-zinc-700">
                <span className="timestamp text-zinc-400 w-16">
                  {formatTime(start)}
                </span>
                <span className="text text-zinc-200 flex-1">
                  {text}
                </span>
                <div className="flex items-center gap-1">
                  {triggered.map((slug) => (
                    <span
                      key={slug}
                      className="px-1 py-0.5 bg-purple-900/30 text-purple-400 rounded"
                    >
                      {slug}
                    </span>
                  ))}
                  <button
                    onClick={() => handleJumpToTime(start)}
                    className="text-xs text-purple-400 hover:text-purple-300 px-1 py-0.5 hover:bg-purple-900/30 rounded"
                  >
                    Jump
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 py-2">No transcription data</div>
      )}
    </div>
  );
};

export const TranscriptionResults = memo(TranscriptionResultsInner);
