import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DictionaryManager } from '../dictionary/DictionaryManager';
import { BleepSoundManager } from '../bleep-sounds/BleepSoundManager';
import { DebugTab } from '../debug/DebugTab';
import { APP_VERSION } from '../../version';
import { useAuthStore } from '../../store/authStore';
import { playerActions } from '../../store/playerStore';
import type { JournalEntry } from '../../utils/idb';
import { HourPackCard, HOUR_PACKS, CurrencySelector } from './HourPackCard';
import { canFreeTopup, daysUntilFreeTopup, formatSeconds } from '../../utils/auth';
import { LoginModal } from '../auth/LoginModal';
import { PaymentModal } from '../auth/PaymentModal';
import type { HourPackType, FiatCurrency, CensoringEffect } from '../../types';

/**
 * Tooltip icon — ⓘ — shows description on hover (desktop) or tap (mobile).
 * Renders via Portal so the tooltip is never clipped by overflow-hidden containers.
 */
function Tooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (show) {
      const el = document.querySelector('[data-tooltip-anchor]');
      if (el) {
        const r = el.getBoundingClientRect();
        setAnchor({ left: r.left + r.width / 2, top: r.top + r.height + 6 });
      }
    }
  }, [show]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShow((v) => !v);
  };

  return (
    <>
      <span
        data-tooltip-anchor
        className="relative inline-flex items-center ml-1 cursor-help"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        onClick={handleClick}
      >
        <span className="text-zinc-600 text-xs select-none">ⓘ</span>
      </span>
      {show && anchor && createPortal(
        <span
          className="fixed z-[100] w-56 px-3 py-2 text-xs leading-relaxed text-zinc-200 bg-zinc-800 border border-zinc-700 rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.6)] whitespace-normal pointer-events-none"
          style={{ left: anchor.left, top: anchor.top, transform: 'translateX(-50%)' }}
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}

type TabKey = 'user' | 'dictionaries' | 'bleep' | 'version' | 'debug' | 'journal';

const TABS: { key: TabKey; emoji: string; tooltip: string }[] = [
  { key: 'user', emoji: '👤', tooltip: 'Account & Balance' },
  { key: 'dictionaries', emoji: '📚', tooltip: 'Dictionaries' },
  { key: 'bleep', emoji: '🔊', tooltip: 'Bleep Sounds' },
  { key: 'version', emoji: '🔄', tooltip: 'Version' },
  { key: 'journal', emoji: '📋', tooltip: 'Transcription Journal' },
  { key: 'debug', emoji: '🐛', tooltip: 'Debug' },
];

interface VersionInfo {
  versions: string[];
  default: string;
}

interface SettingsContentProps {
  onClose: () => void;
}

export function SettingsContent({ onClose }: SettingsContentProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('user');
  const [versions, setVersions] = useState<VersionInfo | null>(null);
  const [frozenHeight, setFrozenHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frozenHeightRef = useRef<number | null>(null);

  const currentVersion = typeof window !== 'undefined'
    ? window.location.pathname.split('/').filter(Boolean).pop() || 'master'
    : 'master';

  // Check for OIDC callback — if we just returned from Telegram auth,
  // close any open modals and refresh
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('code')) {
      onClose();
    }
  }, [onClose]);

  // Animate on tab change / versions load
  useEffect(() => {
    if (animatingRef.current) return;

    const oldH = frozenHeightRef.current;
    if (oldH === null) return;

    animatingRef.current = true;
    setFrozenHeight(oldH);
    requestAnimationFrame(() => {
      const newH = contentRef.current?.scrollHeight ?? oldH;
      setFrozenHeight(newH);
      animTimeoutRef.current = setTimeout(() => {
        setFrozenHeight(null);
        animatingRef.current = false;
      }, 350);
    });
  }, [activeTab, versions]);

  useEffect(() => {
    if (activeTab !== 'version' || versions) return;
    const parts = window.location.pathname.split('/').filter(Boolean);
    const base = '/' + parts[0] + '/';

    fetch(base + 'stable-versions.json')
      .then((r) => r.json())
      .then((data) => setVersions(data))
      .catch(() => {});
  }, [activeTab, versions]);

  const handleVersionSelect = (v: string) => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const base = '/' + parts[0] + '/';
    localStorage.setItem('obrez-version', v);
    window.location.replace(base + v + '/');
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
        <h2 className="text-lg font-semibold text-zinc-100">⚙ Настройки</h2>
        <button
          onClick={onClose}
          className="text-zinc-300 hover:text-zinc-100 transition-colors flex items-center gap-1 text-sm font-medium"
        >
          Вернуться →
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-5 pt-2 gap-2 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              if (animatingRef.current) return;
              const h = contentRef.current?.scrollHeight ?? frozenHeightRef.current;
              if (h != null) {
                setFrozenHeight(h);
                frozenHeightRef.current = h;
              }
              if (animTimeoutRef.current) { clearTimeout(animTimeoutRef.current); animTimeoutRef.current = null; }
              setActiveTab(tab.key);
            }}
            title={tab.tooltip}
            className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-all ${
              activeTab === tab.key
                ? 'bg-zinc-800 text-purple-400 border-b-2 border-purple-500 shadow-[0_-2px_8px_rgba(139,92,246,0.1)]'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            {tab.emoji}
          </button>
        ))}
      </div>

      {/* Content — animated height transitions */}
      <div
        ref={contentRef}
        style={frozenHeight != null ? { height: frozenHeight, transition: 'height 300ms ease-in-out' } : undefined}
      >
        {activeTab === 'user' && (
          <div className="p-5">
            <h3 className="text-sm text-zinc-300 mb-3">
              Account & Balance <Tooltip text="Manage your Telegram account, check transcription balance, and top up hours." />
            </h3>
            <UserContent onClose={onClose} />
          </div>
        )}
        {activeTab === 'dictionaries' && (
          <div className="p-5">
            <h3 className="text-sm text-zinc-300 mb-3">
              Word Lists <Tooltip text="Choose which word lists to match against during transcription. Only active lists highlight matched words." />
            </h3>
            <DictionaryManager />
          </div>
        )}
        {activeTab === 'bleep' && (
          <div className="p-5">
            <h3 className="text-sm text-zinc-300 mb-3">
              Sound Effects <Tooltip text="Manage bleep and censor sounds. Upload custom audio files or use the default tone." />
            </h3>
            <BleepSoundManager />
          </div>
        )}
        {activeTab === 'version' && (
          <div className="p-5">
            <h3 className="text-sm text-zinc-300 mb-3">
              Switch Version <Tooltip text="Switch between master (latest) and stable releases. Useful if master breaks." />
            </h3>
            <VersionContent
              versions={versions}
              currentVersion={currentVersion}
              onSelect={handleVersionSelect}
            />
          </div>
        )}
        {activeTab === 'journal' && (
          <div className="p-5">
            <h3 className="text-sm text-zinc-300 mb-3">
              Transcription Journal <Tooltip text="All saved transcriptions, grouped by file. Load or delete past sessions." />
            </h3>
            <JournalContent />
          </div>
        )}
        {activeTab === 'debug' && (
          <div className="p-5">
            <h3 className="text-sm text-zinc-300 mb-3">
              Debug <Tooltip text="View auth, player, and JS errors captured during the session. Click 'copy raw' to get the raw error string." />
            </h3>
            <DebugTab />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── User tab ───

interface UserContentProps {
  onClose: () => void;
}

function UserContent({ onClose }: UserContentProps) {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const topup = useAuthStore((s) => s.topup);
  const isLoading = useAuthStore((s) => s.isLoading);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const activeInvoice = useAuthStore((s) => s.activeInvoice);
  const [showLogin, setShowLogin] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<FiatCurrency>('USD');
  const [topupSuccess, setTopupSuccess] = useState<string | null>(null);

  // After successful login, close LoginModal and refresh user data
  useEffect(() => {
    if (isAuthenticated && showLogin) {
      setShowLogin(false);
      useAuthStore.getState().checkAuth();
    }
  }, [isAuthenticated, showLogin]);

  const freeAvailable = user ? canFreeTopup(user.last_free_topup) : false;
  const daysLeft = user ? daysUntilFreeTopup(user.last_free_topup) : null;

  const handleLogout = async () => {
    await logout();
    onClose();
  };

  const handleTopup = async (pkgType: HourPackType) => {
    await topup(pkgType, selectedCurrency);
    const err = useAuthStore.getState().error;
    const inv = useAuthStore.getState().activeInvoice;
    if (!err && !inv) {
      const pack = HOUR_PACKS.find((p) => p.type === pkgType);
      setTopupSuccess(`+${pack?.hours || '?'} hours added!`);
      setTimeout(() => setTopupSuccess(null), 3000);
    }
  };

  const handlePaymentPaid = () => {
    setTopupSuccess('Payment received! Your balance has been updated.');
    setTimeout(() => {
      useAuthStore.getState().clearActiveInvoice();
      onClose();
    }, 2000);
  };

  const handlePaymentClose = () => {
    useAuthStore.getState().clearActiveInvoice();
    useAuthStore.getState().checkAuth();
  };

  if (!isAuthenticated) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-3">🔒</div>
        <p className="text-sm text-zinc-400">Not signed in</p>
        <p className="text-xs text-zinc-500 mt-1 mb-4">Sign in with Telegram to use transcription.</p>
        <button
          onClick={() => setShowLogin(true)}
          className="bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium px-6 py-2 rounded-lg transition-colors text-sm shadow-[0_4px_14px_rgba(42,171,238,0.3)]"
        >
          Sign in with Telegram
        </button>
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <div className="relative flex items-center gap-4 p-5 rounded-xl border border-zinc-700 bg-zinc-800/50 shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.2)]" />
        <div className="relative">
          {user?.photo_url ? (
            <img src={user.photo_url} alt={user.first_name} className="w-12 h-12 rounded-full object-cover shadow-[0_2px_10px_rgba(0,0,0,0.4)]" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-lg font-semibold shrink-0 shadow-[0_2px_10px_rgba(139,92,246,0.4)]">
              {user?.first_name?.charAt(0) || '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-zinc-100 font-medium">{user?.first_name}</div>
          {user?.username && (
            <div className="text-xs text-zinc-400">@{user.username}</div>
          )}
          <div className="text-sm text-purple-400 mt-0.5">
            Balance: {formatSeconds(user?.remaining_seconds || 0)}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-zinc-500 hover:text-red-400 transition-colors shrink-0"
          title="Log out"
        >
          Log out
        </button>
      </div>

      {/* Currency selector */}
      <div className="mb-3">
        <div className="text-xs text-zinc-400 mb-1.5">Currency</div>
        <CurrencySelector value={selectedCurrency} onChange={setSelectedCurrency} />
      </div>

      {/* Hour pack cards */}
      <div className="space-y-3">
        {HOUR_PACKS.map((pack, i) => {
          const isFree = pack.type === 'free';
          const isDisabled = isFree && !freeAvailable;
          return (
            <HourPackCard
              key={pack.type}
              pack={pack}
              disabled={isDisabled}
              isLoading={isLoading}
              onSelect={handleTopup}
              delay={i * 1200}
            />
          );
        })}
      </div>

      {/* Payment modal for active invoice */}
      {activeInvoice && (
        <PaymentModal
          invoice={activeInvoice}
          onPaid={handlePaymentPaid}
          onClose={handlePaymentClose}
        />
      )}

      {daysLeft !== null && daysLeft > 0 && (
        <p className="text-xs text-yellow-400 text-center">
          Free topup available in {daysLeft} day{daysLeft > 1 ? 's' : ''}
        </p>
      )}

      {error && (
        <div className="relative p-4 rounded-xl bg-red-900/30 border border-red-700/50 shadow-[0_4px_12px_rgba(127,29,29,0.2)]">
          <p className="text-xs text-red-400">{error}</p>
          <button onClick={clearError} className="text-xs text-red-300 underline mt-1">
            Dismiss
          </button>
        </div>
      )}
      {topupSuccess && (
        <div className="relative p-4 rounded-xl bg-green-900/30 border border-green-700/50 shadow-[0_4px_12px_rgba(22,101,52,0.2)]">
          <p className="text-xs text-green-400">✓ {topupSuccess}</p>
        </div>
      )}
    </div>
  );
}

// ─── Version tab ───

interface VersionContentProps {
  versions: VersionInfo | null;
  currentVersion: string;
  onSelect: (v: string) => void;
}

function VersionContent({ versions, currentVersion, onSelect }: VersionContentProps) {
  if (!versions) {
    return <div className="text-xs text-zinc-500 py-4">Unable to load versions</div>;
  }

  return (
    <div className="space-y-2">
      {versions.versions.map((v) => (
        <button
          key={v}
          onClick={() => onSelect(v)}
          className={`relative w-full flex items-center gap-3 text-xs py-3 px-4 rounded-lg transition-all ${
            v === currentVersion
              ? 'bg-purple-900/30 border border-purple-700/50 text-purple-300 shadow-[0_2px_12px_rgba(139,92,246,0.2),inset_0_1px_0_rgba(139,92,246,0.1)]'
              : 'bg-zinc-700/80 hover:bg-zinc-600 text-zinc-200 shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
          }`}
        >
          <span className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
            v === currentVersion ? 'border-purple-500' : 'border-zinc-500'
          }`}>
            {v === currentVersion && <span className="w-2 h-2 rounded-full bg-purple-500" />}
          </span>
          <span className="font-semibold">{v}</span>
          {v === versions.default && (
            <span className="text-[10px] text-zinc-500 ml-auto">default</span>
          )}
          {v === currentVersion && (
            <span className="text-[10px] text-purple-400 ml-auto">current {APP_VERSION}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Journal tab ────────────────────────────────────────────

function JournalContent() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { loadAllJournalEntries } = await import('../../utils/idb');
        const all = await loadAllJournalEntries();
        setEntries(all.sort((a, b) => b.savedAt - a.savedAt));
      } catch (err) {
        console.error('Failed to load journal:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDeleteAll = async () => {
    if (!confirm('Delete all journal entries?')) return;
    try {
      const { clearJournal } = await import('../../utils/idb');
      await clearJournal();
      setEntries([]);
    } catch (err) {
      console.error('Failed to clear journal:', err);
    }
  };

  const handleDeleteFile = async (fileName: string, fileSize: number) => {
    if (!confirm(`Delete all entries for "${fileName}"?`)) return;
    try {
      const { deleteJournalEntriesForFile } = await import('../../utils/idb');
      await deleteJournalEntriesForFile(fileName, fileSize);
      setEntries((prev) =>
        prev.filter((e) => !(e.fileName === fileName && e.fileSize === fileSize)),
      );
    } catch (err) {
      console.error('Failed to delete file entries:', err);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const { deleteJournalEntry } = await import('../../utils/idb');
      await deleteJournalEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  const handleLoadEntry = (entry: JournalEntry) => {
    playerActions.setTranscriptionResults(entry.transcriptionResults);
    playerActions.setCensoringEffects(entry.censoringEffects as CensoringEffect[]);
    playerActions.setDuration(entry.duration);
    const feedbackEl = document.createElement('div');
    feedbackEl.className = 'fixed bottom-4 right-4 z-[9999] text-xs text-green-400 bg-zinc-800 px-3 py-1.5 rounded shadow-lg';
    feedbackEl.textContent = 'Transcription loaded!';
    document.body.appendChild(feedbackEl);
    setTimeout(() => feedbackEl.remove(), 2000);
  };

  const handleExportEntry = (entry: JournalEntry) => {
    const transcriptionData = entry.transcriptionResults.map(([start, end, text]) => ({
      start,
      end,
      text,
    }));
    const effects = (entry.censoringEffects ?? []).filter(
      (e) => (e as { effectType?: string }).effectType === 'sound',
    );
    const data = JSON.stringify({ transcription: transcriptionData, effects }, null, 2);
    const baseName = entry.fileName.replace(/\.[^.]+$/, '');
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_transcription.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-xs text-zinc-500 py-4">Loading journal...</div>;

  if (entries.length === 0) {
    return <div className="text-xs text-zinc-500 py-4">No saved transcriptions yet.</div>;
  }

  // Group by fileName
  const groups: Map<string, JournalEntry[]> = new Map();
  for (const entry of entries) {
    const key = `${entry.fileName}|||${entry.fileSize}`;
    const existing = groups.get(key) ?? [];
    existing.push(entry);
    groups.set(key, existing);
  }

  return (
    <div className="space-y-4">
      {/* Delete all button */}
      <div className="flex justify-end">
        <button
          onClick={handleDeleteAll}
          className="text-[10px] bg-red-900/40 hover:bg-red-800/50 text-red-300 px-2 py-1 rounded transition-colors"
        >
          Delete All
        </button>
      </div>

      {/* Grouped entries */}
      {Array.from(groups.entries()).map(([key, fileEntries]) => {
        const fileName = fileEntries[0].fileName;
        return (
          <div key={key} className="bg-zinc-700/40 rounded-lg p-3 space-y-2">
            {/* File header */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-200 truncate mr-2">
                {fileName}
              </span>
              <button
                onClick={() => handleDeleteFile(fileName, fileEntries[0].fileSize)}
                className="shrink-0 text-[10px] bg-zinc-600 hover:bg-red-800/50 text-zinc-300 hover:text-red-300 px-2 py-0.5 rounded transition-colors"
              >
                Delete all for this file
              </button>
            </div>

            {/* Entries with version labels */}
            {fileEntries.map((entry, i) => {
              const date = new Date(entry.savedAt);
              const dateStr = date.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              });
              const timeStr = date.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });
              const versionLabel = fileEntries.length > 1 ? `v${i + 1}` : '';
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-2 text-xs bg-zinc-800/60 rounded px-2 py-1.5"
                >
                  {/* Method icon */}
                  <span
                    className={`shrink-0 w-4 h-4 flex items-center justify-center rounded text-[10px] ${
                      entry.method === 'transcribe'
                        ? 'bg-purple-900/60 text-purple-300'
                        : entry.method === 'manual'
                          ? 'bg-green-900/60 text-green-300'
                          : 'bg-blue-900/60 text-blue-300'
                    }`}
                    title={
                      entry.method === 'transcribe'
                        ? 'Transcribed'
                        : entry.method === 'manual'
                          ? 'Manually saved'
                          : 'Imported'
                    }
                  >
                    {entry.method === 'transcribe' ? 'T' : entry.method === 'manual' ? 'S' : 'I'}
                  </span>

                  {/* Version, date and segment count */}
                  <span className="flex-1 min-w-0 text-zinc-400">
                    {versionLabel && <span className="text-zinc-500 mr-1">{versionLabel}</span>}
                    {dateStr} {timeStr} · {entry.transcriptionResults.length} segments · {entry.censoringEffects.length} effects
                  </span>

                  {/* Load into player */}
                  <button
                    onClick={() => handleLoadEntry(entry)}
                    className="shrink-0 bg-zinc-600 hover:bg-zinc-500 text-zinc-200 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                    title="Load transcription into player"
                  >
                    ▶️
                  </button>

                  {/* Export as JSON */}
                  <button
                    onClick={() => handleExportEntry(entry)}
                    className="shrink-0 bg-zinc-600 hover:bg-zinc-500 text-zinc-200 px-1.5 py-0.5 rounded text-[10px] transition-colors"
                    title="Export transcription as JSON"
                  >
                    💾
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
