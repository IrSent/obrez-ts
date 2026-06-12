import { memo, useState } from 'react';

/**
 * Icon: close (X)
 */
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * Icon: plus
 */
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

interface AddWordModalProps {
  onClose: () => void;
  onAdd: (start: number, end: number, text: string) => void;
  duration?: number;
}

const AddWordModal = memo(({ onClose, onAdd, duration }: AddWordModalProps) => {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);

    const s = parseFloat(start);
    const e = parseFloat(end);

    if (isNaN(s) || s < 0) {
      setError('Invalid start time');
      return;
    }
    if (isNaN(e) || e <= s) {
      setError('End time must be greater than start time');
      return;
    }
    if (duration && e > duration) {
      setError('End time exceeds media duration');
      return;
    }
    if (!word.trim()) {
      setError('Word is required');
      return;
    }

    onAdd(s, e, word.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg p-5 w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <PlusIcon /> Add Word
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-600 text-zinc-400">
            <CloseIcon />
          </button>
        </div>

        {/* Start time */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Start (seconds)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max={duration?.toString()}
            value={start}
            onChange={(e) => setStart(e.target.value)}
            placeholder="0.0"
            className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500 placeholder-zinc-500"
          />
        </div>

        {/* End time */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">End (seconds)</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max={duration?.toString()}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            placeholder="0.0"
            className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500 placeholder-zinc-500"
          />
        </div>

        {/* Word */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Word</label>
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Enter the word…"
            className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500 placeholder-zinc-500"
          />
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 rounded p-2">
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2 rounded transition-colors"
        >
          Add Word
        </button>
      </div>
    </div>
  );
});

export { AddWordModal };
