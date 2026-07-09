import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../../store/authStore';
import { usePlayerStore } from '../../store/playerStore';

interface ErrorEntry {
  label: string;
  msg: string;
  source: string | null;
  frames: string[];
  raw: string;
  time: string;
}

const DEBUG_ERRORS: ErrorEntry[] = (window as unknown as Record<string, ErrorEntry[]>).__obrezErrors;

export function DebugButton() {
  const [open, setOpen] = useState(false);
  const [jsErrors, setJsErrors] = useState<ErrorEntry[]>(DEBUG_ERRORS.slice());
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const authError = useAuthStore((s) => s.error);
  const playerError = usePlayerStore((s) => s.error);

  // Poll for new errors — settings-early.js pushes to the shared array
  const pollErrors = useCallback(() => {
    const current = (window as unknown as Record<string, ErrorEntry[]>).__obrezErrors;
    if (current.length !== jsErrors.length) {
      setJsErrors(current.slice());
    }
  }, [jsErrors.length]);

  useEffect(() => {
    pollRef.current = setInterval(pollErrors, 500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pollErrors]);

  const handleToggle = () => {
    if (!open) {
      pollErrors();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    DEBUG_ERRORS.length = 0;
    setJsErrors([]);
  };

  const handleCopy = (err: ErrorEntry) => {
    const text =
      `[${err.time}] ${err.label}` +
      (err.source ? `\n📍 ${err.source}` : '') +
      (err.msg ? `\n${err.msg}` : '') +
      '\n\n--- Raw ---\n' +
      err.raw;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const totalErrors = jsErrors.length + (authError ? 1 : 0) + (playerError ? 1 : 0);
  const badgeText = totalErrors > 0 ? (totalErrors > 99 ? '99+' : String(totalErrors)) : '';

  return (
    <>
      <button
        id="obrez-debug-btn"
        onClick={handleToggle}
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer text-sm transition-colors ${
          totalErrors > 0 ? 'text-red-400' : 'text-zinc-600'
        } hover:text-red-300`}
        title="View errors"
      >
        🐛
        {badgeText && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center bg-red-600 text-white text-[10px] font-bold rounded-full px-1 shadow">
            {badgeText}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed top-14 right-3 z-50 bg-zinc-900 border border-zinc-700 rounded-xl p-4 w-[calc(100vw-24px)] max-w-[500px] max-h-[calc(100vh-80px)] overflow-y-auto shadow-2xl">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800">
            <span className="text-xs font-bold text-red-400">
              {!totalErrors ? '✓ No errors' : `⚠ ${totalErrors} error${totalErrors > 1 ? 's' : ''}`}
            </span>
            <button
              onClick={handleClear}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Clear all
            </button>
          </div>

          {!totalErrors && (
            <div className="text-xs text-zinc-500 py-4 text-center">
              No errors captured yet.
            </div>
          )}

          {/* Store errors */}
          <div className="space-y-2">
            {authError && (
              <div className="rounded-lg p-2 bg-red-900/30 border border-red-800/50">
                <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Auth</div>
                <div className="text-[11px] text-zinc-300 mt-1">{authError}</div>
              </div>
            )}
            {playerError && (
              <div className="rounded-lg p-2 bg-red-900/30 border border-red-800/50">
                <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Player</div>
                <div className="text-[11px] text-zinc-300 mt-1">{playerError}</div>
              </div>
            )}
          </div>

          {/* JS captured errors */}
          {jsErrors.length > 0 && (
            <>
              <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-4 mb-2">Captured</div>
              <div className="space-y-3">
                {jsErrors.slice().reverse().map((err, i) => (
                  <div
                    key={`${i}-${err.time}`}
                    onClick={() => handleCopy(err)}
                    className="cursor-pointer rounded-lg p-2 bg-zinc-800/50 hover:bg-zinc-800 transition-colors active:bg-zinc-700"
                    title="Click to copy"
                  >
                    <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                      [{err.time}] {err.label}
                    </div>
                    {err.source && (
                      <div className="text-[10px] text-blue-400 mt-1">📍 {err.source}</div>
                    )}
                    {err.msg && (
                      <div className="text-[11px] text-zinc-300 mt-1 line-clamp-3">{err.msg}</div>
                    )}
                    {err.frames.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {err.frames.map((f, fi) => (
                          <div key={fi} className="text-[10px] text-zinc-500 pl-2 border-l border-zinc-700">
                            at {f}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
