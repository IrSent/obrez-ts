import { memo, useState } from 'react';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

const TranscriptionResultsInner = () => {
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const transcribing = usePlayerStore((state) => state.transcribing);
  const loadedDictionaries = usePlayerStore((state) => state.loadedDictionaries);
  const activeDictionaries = usePlayerStore((state) => state.activeDictionaries);
  const actions = usePlayerActions();
  const { transcribe, seekToTime } = useMediaPlayerContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMatchesOnly, setShowMatchesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleTranscribe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      await transcribe();
      setIsLoading(false);
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Failed to transcribe: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  const handleJumpToTime = (time: number) => {
    seekToTime(time);
    document.getElementById('videoCanvas')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Форматируем время для отображения
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Получаем slug-и активных словарей, в которых найдены совпадения в тексте
  const getTriggeredDictionaries = (text: string): { slug: string; count: number }[] => {
    const triggered: { slug: string; count: number }[] = [];
    activeDictionaries.forEach((slug) => {
      const dict = loadedDictionaries[slug];
      if (!dict) return;

      const matches = dict.scanner.findMatches(text.toLowerCase());
      if (matches.length > 0) {
        triggered.push({ slug, count: matches.length });
      }
    });
    return triggered;
  };

  // Подсветка подстроки поиска в тексте — разбиваем на части и обёртываем совпадение в <mark>
  const highlightSearch = (text: string): Array<{ key: string; highlighted: boolean; content: string }> => {
    if (!searchQuery) {
      return [{ key: '', highlighted: false, content: text }];
    }
    const parts: Array<{ key: string; highlighted: boolean; content: string }> = [];
    const lower = text.toLowerCase();
    const query = searchQuery.toLowerCase();
    let idx = 0;
    let pos = 0;
    while ((idx = lower.indexOf(query, pos)) !== -1) {
      if (idx > pos) {
        parts.push({ key: idx + '-' + pos, highlighted: false, content: text.slice(pos, idx) });
      }
      parts.push({ key: idx + '-' + (idx + query.length), highlighted: true, content: text.slice(idx, idx + query.length) });
      pos = idx + query.length;
    }
    if (pos < text.length) {
      parts.push({ key: pos + '-end', highlighted: false, content: text.slice(pos) });
    }
    return parts;
  };

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-sm font-semibold text-zinc-300 shrink-0">Transcription Results</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="text-xs bg-zinc-700 text-zinc-200 placeholder-zinc-500 border border-zinc-600 rounded px-2 py-1 focus:outline-none focus:border-purple-500 w-32 shrink-0"
          />
          <button
            onClick={() => setShowMatchesOnly((v) => !v)}
            className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${showMatchesOnly ? 'bg-purple-900/50 text-purple-300' : 'text-purple-400 hover:bg-purple-900/30'}`}
            title="Show only dictionary matches"
          >
            Matches only
          </button>
          <button
            onClick={handleTranscribe}
            disabled={isLoading}
            className="text-xs font-semibold px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors shrink-0"
          >
            {transcribing ? 'Transcribing...' : isLoading ? 'Loading...' : 'Transcribe'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 p-2 bg-red-900/20 rounded">
          {error}
        </div>
      )}

      {transcribing ? (
        <div className="text-xs text-zinc-500 py-2">Transcribing...</div>
      ) : isLoading && !transcriptionResults ? (
        <div className="text-xs text-zinc-500 py-2">Loading transcription...</div>
      ) : transcriptionResults && transcriptionResults.length > 0 ? (
        <div className="space-y-1">
          {transcriptionResults.map(([start, end, text]) => {
            const triggered = getTriggeredDictionaries(text);

            if (showMatchesOnly && triggered.length === 0) {
              return null;
            }

            if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) {
              return null;
            }

            const highlightedText = highlightSearch(text);

            return (
              <div key={start} className={`flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-zinc-700 ${triggered.length > 0 ? 'ring-1 ring-red-800/50' : ''}`}>
                <span className="timestamp text-zinc-400 w-16">
                  {formatTime(start)}
                </span>
                <span className="text text-zinc-200 flex-1">
                  {highlightedText.map((part) =>
                    part.highlighted ? (
                      <mark key={part.key} className="bg-yellow-900/60 text-yellow-200 rounded px-0.5">
                        {part.content}
                      </mark>
                    ) : (
                      <span key={part.key}>{part.content}</span>
                    )
                  )}
                </span>
                <div className="flex items-center gap-1">
                  {triggered.map(({ slug, count }) => (
                    <span
                      key={slug}
                      className="px-1 py-0.5 bg-purple-900/30 text-purple-400 rounded"
                    >
                      {slug} ×{count}
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
