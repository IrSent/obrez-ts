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

  const handleCopyAll = () => {
    const lines: string[] = [];
    if (authError) lines.push(`[Auth] ${authError}`);
    if (playerError) lines.push(`[Player] ${playerError}`);
    for (const err of jsErrors) {
      lines.push(`[${err.time}] ${err.label}: ${err.raw}`);
    }
    handleCopy(lines.join('\n\n'));
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
    <div className="space-y-2">
      {/* Clear all persisted data */}
      <ClearAllData />

      {/* Summary */}
      <div className="flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <span className={`text-sm font-bold ${!totalErrors ? 'text-green-400' : 'text-red-400'}`}>
          {!totalErrors ? '✓ No errors' : `⚠ ${totalErrors} error${totalErrors > 1 ? 's' : ''}`}
        </span>
        {totalErrors > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Copy all
            </button>
            <button
              onClick={handleClear}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Store errors */}
      {authError && (
        <div
          className="rounded-lg p-2 bg-red-900/20 border border-red-800/50 cursor-pointer hover:bg-red-900/30 transition-colors"
          onClick={() => handleCopy(authError)}
          title="Click to copy raw error"
        >
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Auth</div>
          <div className="text-xs text-zinc-300 mt-0.5">{authError}</div>
        </div>
      )}
      {playerError && (
        <div
          className="rounded-lg p-2 bg-red-900/20 border border-red-800/50 cursor-pointer hover:bg-red-900/30 transition-colors"
          onClick={() => handleCopy(playerError)}
          title="Click to copy raw error"
        >
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Player</div>
          <div className="text-xs text-zinc-300 mt-0.5">{playerError}</div>
        </div>
      )}

      {/* JS captured errors */}
      {jsErrors.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">Captured</div>
          {jsErrors.slice().reverse().map((err, i) => (
            <div
              key={`${i}-${err.time}`}
              className="rounded-lg p-2 bg-zinc-800/50 border border-zinc-700/50"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">
                  [{err.time}] {err.label}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCopy(err.raw); }}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 transition-colors flex items-center gap-1"
                  title="Copy raw error"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                  copy raw
                </button>
              </div>

              {/* Source location */}
              {err.source && (
                <div className="text-[10px] text-blue-400 mt-0.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-0.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {formatSource(err.source)}
                </div>
              )}

              {/* Message */}
              {err.msg && (
                <div className="text-xs text-zinc-300 mt-0.5 line-clamp-2">{err.msg}</div>
              )}

              {/* Stack trace */}
              {err.frames.length > 0 && (
                <details className="mt-1 group">
                  <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors select-none">
                    Stack trace ({err.frames.length} frames)
                  </summary>
                  <div className="mt-0.5 space-y-px text-[10px] text-zinc-400">
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
        <div className="text-xs text-zinc-500 py-3 text-center">
          No errors captured yet.
        </div>
      )}
    </div>
  );
}

/** Clears everything that survives a page reload: localStorage, IndexedDB, and hard-reloads to bust HTTP cache. */
function ClearAllData() {
  const handleClear = () => {
    if (!confirm('Delete all local data (auth, session, journal, bleep sounds, settings)?')) return;

    // 1. localStorage — wipe all obrez keys
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('obrez')) keysToRemove.push(key);
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // 2. sessionStorage — wipe PKCE and other state
    sessionStorage.clear();

    // 3. IndexedDB — delete databases
    if (typeof indexedDB !== 'undefined') {
      indexedDB.deleteDatabase('obrez-state');
      indexedDB.deleteDatabase('obrez-bleep');
    }

    // 4. Hard reload — bypass HTTP cache via unique query param
    window.location.replace(window.location.pathname + '?_clear=' + Date.now());
  };

  return (
    <div className="mt-4 pt-4 border-t border-zinc-700">
      <button
        onClick={handleClear}
        className="w-full text-xs text-red-400 hover:text-red-300 px-3 py-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 border border-red-800/30 transition-colors"
      >
        🗑 Clear All Data & Reload
      </button>
      <p className="text-[10px] text-zinc-600 mt-1.5">
        Removes localStorage, IndexedDB, sessionStorage, and forces a fresh page load.
      </p>
    </div>
  );
}
