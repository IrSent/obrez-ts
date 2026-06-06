import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import type { BleepSound } from '../../types';

/**
 * Generate a short unique id.
 */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Decode an audio source (base64 data or URL) into an AudioBuffer.
 */
async function decodeAudio(
  source: 'file' | 'url',
  sourceUrl: string,
  context: AudioContext,
): Promise<AudioBuffer> {
  let arrayBuffer: ArrayBuffer;

  if (source === 'file') {
    const binary = atob(sourceUrl.split(',')[1] || sourceUrl);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrayBuffer = bytes.buffer;
  } else {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  }

  return context.decodeAudioData(arrayBuffer);
}

/**
 * Close icon (X) — inline SVG.
 */
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * Play icon — inline SVG.
 */
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

/**
 * Plus icon — inline SVG.
 */
const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/**
 * File upload icon.
 */
const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
  </svg>
);

/**
 * Link icon.
 */
const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

/**
 * Decode button icon (spinner-like).
 */
const LoadingIcon = () => (
  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0110 10" strokeOpacity="0.75" />
  </svg>
);

/**
 * Add Sound Modal — lets the user add a sound from disk or a URL.
 */
interface AddModalProps {
  onAdd: (id: string, label: string, source: 'file' | 'url', sourceUrl: string) => void;
  onClose: () => void;
}

const AddModal = memo(({ onAdd, onClose }: AddModalProps) => {
  const [mode, setMode] = useState<'file' | 'url'>('file');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setLoading(true);

    const labelText = label.trim() || file.name;

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const id = uid();
      onAdd(id, labelText, 'file', base64);
      onClose();
    } catch {
      setError('Failed to read file');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUrlSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setError(null);
    setLoading(true);

    const labelText = label.trim() || trimmed;

    try {
      const res = await fetch(trimmed, { method: 'HEAD' });
      if (!res.ok) {
        setError(`URL not accessible (status ${res.status})`);
        return;
      }

      const id = uid();
      onAdd(id, labelText, 'url', trimmed);
      onClose();
    } catch {
      setError('Failed to reach URL');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg p-5 w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add Bleep Sound</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-zinc-600 text-zinc-400">
            <CloseIcon />
          </button>
        </div>

        {/* Label input */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Label (optional)</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Classic Beep"
            className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode('file')}
            className={`flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded transition-colors ${
              mode === 'file'
                ? 'bg-purple-600 text-white'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            <FileIcon /> From Disk
          </button>
          <button
            onClick={() => setMode('url')}
            className={`flex-1 flex items-center justify-center gap-2 text-xs py-2 rounded transition-colors ${
              mode === 'url'
                ? 'bg-purple-600 text-white'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            <LinkIcon /> From URL
          </button>
        </div>

        {/* File mode */}
        {mode === 'file' && (
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            className="w-full text-xs bg-zinc-700 rounded px-3 py-2 outline-none file:mr-3 file:py-1 file:px-3 file:rounded file:bg-purple-600 file:text-white file:cursor-pointer"
          />
        )}

        {/* URL mode */}
        {mode === 'url' && (
          <div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/sound.mp3"
              className="w-full bg-zinc-700 rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-purple-500 mb-2"
            />
            <button
              onClick={handleUrlSubmit}
              disabled={!url.trim() || loading}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white text-xs py-2 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Add Sound'}
            </button>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
});

/**
 * A single sound row.
 */
interface SoundRowProps {
  sound: BleepSound;
  loading: boolean;
  onUpdateLabel: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onPlay: (buffer: AudioBuffer) => void;
  onDecode: (id: string) => void;
}

const SoundRow = memo(({ sound, loading, onUpdateLabel, onRemove, onPlay, onDecode }: SoundRowProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sound.label);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== sound.label) {
      onUpdateLabel(sound.id, trimmed);
    } else {
      setDraft(sound.label);
    }
    setEditing(false);
  };

  const handlePlay = () => {
    if (sound.audioBuffer) onPlay(sound.audioBuffer);
  };

  const handleDecode = () => {
    onDecode(sound.id);
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-700">
      {/* Play / decode button */}
      {sound.audioBuffer ? (
        <button
          onClick={handlePlay}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-400"
          aria-label="Preview"
          title="Preview sound"
        >
          <PlayIcon />
        </button>
      ) : loading ? (
        <button
          disabled
          className="p-1 rounded text-zinc-500"
          title="Decoding..."
        >
          <LoadingIcon />
        </button>
      ) : (
        <button
          onClick={handleDecode}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300"
          aria-label="Load sound"
          title="Load sound (decode on demand)"
        >
          <PlayIcon />
        </button>
      )}

      {/* Label */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') {
                setDraft(sound.label);
                setEditing(false);
              }
            }}
            className="w-full bg-zinc-600 rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-purple-500"
            autoFocus
          />
        ) : (
          <span
            className="block text-xs truncate cursor-pointer hover:text-zinc-200"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to edit"
          >
            {sound.label}
          </span>
        )}
      </div>

      {/* Source badge */}
      <span className="text-[10px] text-zinc-500 uppercase">
        {sound.source === 'file' ? 'file' : 'url'}
      </span>

      {/* Remove */}
      <button
        onClick={() => onRemove(sound.id)}
        className="p-1 rounded hover:bg-zinc-600 text-zinc-400"
        aria-label="Remove"
      >
        <CloseIcon />
      </button>
    </div>
  );
});

/**
 * Main Bleep Sound Manager.
 */
const BleepSoundManagerInner = () => {
  const bleepSounds = usePlayerStore((state) => state.bleepSounds);
  const actions = usePlayerActions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Decode sounds from localStorage on mount (lazy, in background)
  useEffect(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const ids = Object.keys(bleepSounds);
    if (ids.length === 0) return;

    // Decode each sound that doesn't have a buffer yet
    for (const id of ids) {
      const sound = bleepSounds[id];
      if (sound.audioBuffer) continue;

      setLoadingIds((prev) => new Set(prev).add(id));

      decodeAudio(sound.source, sound.sourceUrl, ctx)
        .then((buffer) => {
          actions.setBleepBuffer(id, buffer);
        })
        .catch(() => {
          // leave null — user can retry
        })
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    }

    return () => {
      ctx.close();
      audioCtxRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  const getAudioCtx = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }, []);

  const handlePlay = useCallback((buffer: AudioBuffer) => {
    const ctx = getAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }, [getAudioCtx]);

  const handleAdd = useCallback(
    (id: string, label: string, source: 'file' | 'url', sourceUrl: string) => {
      actions.addBleepSound(id, label, source, sourceUrl);
    },
    [actions],
  );

  const handleDecode = useCallback(
    (id: string) => {
      const sound = bleepSounds[id];
      if (!sound) return;

      setLoadingIds((prev) => new Set(prev).add(id));

      decodeAudio(sound.source, sound.sourceUrl, getAudioCtx())
        .then((buffer) => {
          actions.setBleepBuffer(id, buffer);
        })
        .catch(() => {})
        .finally(() => {
          setLoadingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    },
    [bleepSounds, actions, getAudioCtx],
  );

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Bleep Sounds</h2>

      <button
        onClick={() => setShowAddModal(true)}
        className="w-full flex items-center justify-center gap-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded transition-colors mb-3"
      >
        <PlusIcon /> Add Sound
      </button>

      {Object.keys(bleepSounds).length > 0 ? (
        <div className="space-y-2">
          {Object.values(bleepSounds).map((sound) => (
            <SoundRow
              key={sound.id}
              sound={sound}
              loading={loadingIds.has(sound.id)}
              onUpdateLabel={actions.updateBleepLabel}
              onRemove={actions.removeBleepSound}
              onPlay={handlePlay}
              onDecode={handleDecode}
            />
          ))}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 py-2">No bleep sounds added</div>
      )}

      {showAddModal && <AddModal onAdd={handleAdd} onClose={() => setShowAddModal(false)} />}
    </div>
  );
};

export const BleepSoundManager = memo(BleepSoundManagerInner);
