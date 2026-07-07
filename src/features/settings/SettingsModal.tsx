import { useState, useEffect } from 'react';
import { DictionaryManager } from '../dictionary/DictionaryManager';
import { BleepSoundManager } from '../bleep-sounds/BleepSoundManager';

type TabKey = 'dictionaries' | 'bleep' | 'version';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'dictionaries', label: 'Dictionaries' },
  { key: 'bleep', label: 'Bleep Sounds' },
  { key: 'version', label: 'Version' },
];

interface VersionInfo {
  versions: string[];
  default: string;
}

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('dictionaries');
  const [versions, setVersions] = useState<VersionInfo | null>(null);

  const currentVersion = typeof window !== 'undefined'
    ? window.location.pathname.split('/').filter(Boolean).pop() || 'master'
    : 'master';

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
      <div className="bg-zinc-900 rounded-xl w-full max-w-2xl mx-4 shadow-2xl border border-zinc-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-100">⚙ Настройки</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors p-1 rounded hover:bg-zinc-800"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-800 px-4 pt-2 gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-xs font-semibold rounded-t transition-colors ${
                activeTab === tab.key
                  ? 'bg-zinc-800 text-purple-400 border-b-2 border-purple-500'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'dictionaries' && (
            <div className="p-4"><DictionaryManager /></div>
          )}
          {activeTab === 'bleep' && (
            <div className="p-4"><BleepSoundManager /></div>
          )}
          {activeTab === 'version' && (
            <div className="p-4">
              <VersionContent
                versions={versions}
                currentVersion={currentVersion}
                onSelect={handleVersionSelect}
              />
            </div>
          )}
        </div>
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
          className={`w-full flex items-center gap-3 text-xs py-3 px-4 rounded-lg transition-colors ${
            v === currentVersion
              ? 'bg-purple-900/30 border border-purple-700/50 text-purple-300'
              : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
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
            <span className="text-[10px] text-purple-400 ml-auto">current</span>
          )}
        </button>
      ))}
    </div>
  );
}
