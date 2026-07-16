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

export function DebugTab() {
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

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    DEBUG_ERRORS.length = 0;
    setJsErrors([]);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const totalErrors = jsErrors.length + (authError ? 1 : 0) + (playerError ? 1 : 0);
  const badgeText = totalErrors > 0 ? (totalErrors > 99 ? '99+' : String(totalErrors)) : '';

  // Parse file:line from stack frames for readability
  const parseLocation = (frame: string): { func: string; loc: string } => {
    const m = frame.match(/at\s+(.+?)(\s+@)?\s*([^@]+)$/);
    if (m) {
      return { func: m[1].trim(), loc: m[3].trim() };
    }
    return { func: frame, loc: '' };
  };

  // Format source location into a readable file:line
  const formatSource = (src: string): string => {
    const m = src.match(/([^\/]+)(?::(\d+))?(?::(\d+))?$/);
    if (m) {
      const file = m[1];
      const line = m[2] || '';
      const col = m[3] || '';
      return line ? `${file}:${line}${col ? `:${col}` : ''}` : file;
    }
    return src;
  };

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <span className={`text-sm font-bold ${!totalErrors ? 'text-green-400' : 'text-red-400'}`}>
          {!totalErrors ? '✓ No errors' : `⚠ ${totalErrors} error${totalErrors > 1 ? 's' : ''}`}
        </span>
        {totalErrors > 0 && (
          <button
            onClick={handleClear}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Store errors */}
      {authError && (
        <div
          className="rounded-lg p-3 bg-red-900/20 border border-red-800/50 cursor-pointer hover:bg-red-900/30 transition-colors"
          onClick={() => handleCopy(authError)}
          title="Click to copy raw error"
        >
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Auth</div>
          <div className="text-xs text-zinc-300 mt-1">{authError}</div>
        </div>
      )}
      {playerError && (
        <div
          className="rounded-lg p-3 bg-red-900/20 border border-red-800/50 cursor-pointer hover:bg-red-900/30 transition-colors"
          onClick={() => handleCopy(playerError)}
          title="Click to copy raw error"
        >
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Player</div>
          <div className="text-xs text-zinc-300 mt-1">{playerError}</div>
        </div>
      )}

      {/* JS captured errors */}
      {jsErrors.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Captured</div>
          {jsErrors.slice().reverse().map((err, i) => (
            <div
              key={`${i}-${err.time}`}
              className="rounded-lg p-3 bg-zinc-800/50 border border-zinc-700/50"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                  [{err.time}] {err.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(err.raw); }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors"
                  title="Copy raw error"
                >
                  📋 copy raw
                </button>
              </div>

              {/* Source location */}
              {err.source && (
                <div className="text-[10px] text-blue-400 mt-1">
                  📍 {formatSource(err.source)}
                </div>
              )}

              {/* Message */}
              {err.msg && (
                <div className="text-xs text-zinc-300 mt-1 line-clamp-2">{err.msg}</div>
              )}

              {/* Stack trace */}
              {err.frames.length > 0 && (
                <details className="mt-2 group">
                  <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none">
                    Stack trace ({err.frames.length} frames)
                  </summary>
                  <div className="mt-1 space-y-0.5 text-[10px] text-zinc-400">
                    {err.frames.map((f, fi) => {
                      const { func, loc } = parseLocation(f);
                      return (
                        <div
                          key={fi}
                          className="flex items-start gap-1 pl-2 border-l-2 border-zinc-700 group-hover:border-zinc-600 transition-colors"
                        >
                          <span className="text-zinc-600 shrink-0 w-4 text-right">
                            {fi + 1}.
                          </span>
                          <span>
                            <span className="text-zinc-300">{func}</span>
                            {loc && <span className="text-zinc-500 ml-1">— {formatSource(loc)}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {!totalErrors && (
        <div className="text-xs text-zinc-500 py-4 text-center">
          No errors captured yet.
        </div>
      )}
    </div>
  );
}
