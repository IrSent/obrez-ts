import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DictionaryManager } from '../dictionary/DictionaryManager';
import { BleepSoundManager } from '../bleep-sounds/BleepSoundManager';
import { DebugTab } from '../debug/DebugTab';
import { APP_VERSION } from '../../version';
import { useAuthStore } from '../../store/authStore';
import { HourPackCard, HOUR_PACKS } from './HourPackCard';
import { canFreeTopup, daysUntilFreeTopup, formatSeconds } from '../../utils/auth';
import { LoginModal } from '../auth/LoginModal';

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

type TabKey = 'user' | 'player' | 'dictionaries' | 'bleep' | 'version' | 'debug';

const TABS: { key: TabKey; emoji: string; tooltip: string }[] = [
  { key: 'user', emoji: '👤', tooltip: 'Account & Balance' },
  { key: 'player', emoji: '▶', tooltip: 'Player' },
  { key: 'dictionaries', emoji: '📚', tooltip: 'Dictionaries' },
  { key: 'bleep', emoji: '🔊', tooltip: 'Bleep Sounds' },
  { key: 'version', emoji: '🔄', tooltip: 'Version' },
  { key: 'debug', emoji: '🐛', tooltip: 'Debug' },
];

interface VersionInfo {
  versions: string[];
  default: string;
}

interface SettingsModalProps {
  onClose: () => void;
}

// Shared 3D shadow stack for modals
const MODAL_SHADOW = 'shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_60px_rgba(139,92,246,0.15),0_0_0_1px_rgba(113,113,122,0.5)]';

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('user');
  const [versions, setVersions] = useState<VersionInfo | null>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animatingRef = useRef(false);
  const animTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockedHeightRef = useRef<number | null>(null);

  const currentVersion = typeof window !== 'undefined'
    ? window.location.pathname.split('/').filter(Boolean).pop() || 'master'
    : 'master';

  // Measure and lock initial content height after mount
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (contentRef.current) {
          const h = contentRef.current.scrollHeight;
          setLockedHeight(h);
          lockedHeightRef.current = h;
        }
      });
    });
  }, []);

  // Animate on tab change / versions load / unlock
  useEffect(() => {
    if (animatingRef.current) return;

    // On unlock: nothing to animate — container already fits content
    if (lockedHeight === null) return;

    animatingRef.current = true;
    const oldH = lockedHeightRef.current;

    setLockedHeight(oldH);
    requestAnimationFrame(() => {
      const newH = contentRef.current?.scrollHeight ?? oldH;
      setLockedHeight(newH);
      animTimeoutRef.current = setTimeout(() => {
        setLockedHeight(null);
        animatingRef.current = false;
      }, 350);
    });
  }, [activeTab, versions, lockedHeight]);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`relative flex flex-col overflow-hidden mx-4 my-auto max-h-[85vh] w-full max-w-2xl rounded-xl bg-zinc-900 ${MODAL_SHADOW}`}
      >
        {/* 3D inner bevel highlight */}
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.08)] border-b-[rgba(0,0,0,0.35)]" />
        {/* Header */}
        <div className="relative flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-lg font-semibold text-zinc-100">⚙ Настройки</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="relative flex border-b border-zinc-800 px-5 pt-2 gap-2 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                if (animatingRef.current) return;
                // Freeze current height before content swaps — so shrink animates
                const h = contentRef.current?.scrollHeight ?? lockedHeightRef.current;
                if (h != null) {
                  setLockedHeight(h);
                  lockedHeightRef.current = h;
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

        {/* Content — animated height */}
        <div
          ref={contentRef}
          className="overflow-y-auto flex-1 min-h-0"
          style={lockedHeight != null ? { height: lockedHeight, transition: 'height 300ms ease-in-out' } : undefined}
        >
          {activeTab === 'user' && (
            <div className="p-5">
              <h3 className="text-sm text-zinc-300 mb-3">
                Account & Balance <Tooltip text="Manage your Telegram account, check transcription balance, and top up hours." />
              </h3>
              <UserContent onClose={onClose} />
            </div>
          )}
          {activeTab === 'player' && (
            <div className="p-5">
              <h3 className="text-sm text-zinc-300 mb-3">
                Player <Tooltip text="Settings for media playback — autoplay, speed, and quality options." />
              </h3>
              <PlayerContent />
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
  const [showLogin, setShowLogin] = useState(false);

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

  const handleTopup = async (pkgType: string) => {
    await topup(pkgType as Parameters<typeof topup>[0]);
    if (!useAuthStore.getState().error) {
      onClose();
    }
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
        {/* inner bevel */}
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
    </div>
  );
}

// ─── Player tab ───

function PlayerContent() {
  return (
    <div className="space-y-4">
      {/* Play on load */}
      <div className="relative flex items-center justify-between p-5 rounded-xl border border-zinc-700 bg-zinc-800/50 shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.05)]">
        {/* inner bevel */}
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.2)]" />
        <div className="relative">
          <div className="text-sm text-zinc-200 font-medium">
            ▶ Play on load
            <Tooltip text="When enabled, the video starts playing automatically as soon as a file is loaded. Disable to review the timeline before playback." />
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Auto-play video after loading a file</div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            id="obrez-play-on-load"
            className="sr-only peer"
            defaultChecked={localStorage.getItem('obrez_play_on_load') === 'true'}
            onChange={(e) => {
              localStorage.setItem('obrez_play_on_load', e.target.checked ? 'true' : 'false');
            }}
          />
          <div className="w-11 h-6 bg-zinc-600 rounded-full peer-checked:bg-purple-600 peer-focus:ring-2 peer-focus:ring-purple-500/50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:duration-200 peer-checked:after:translate-x-full" />
        </label>
      </div>
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
