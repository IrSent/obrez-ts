import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { usePlayerStore, usePlayerActions, hydrateBleepSounds } from '../../store/playerStore';
import type { BleepSound } from '../../types';

/**
 * Generate a short unique id.
 */
function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Decode an audio source (base64 data URL or remote URL) into an AudioBuffer.
 * Prefers dataUrl if available; falls back to url.
 */
async function decodeAudio(
  sound: BleepSound,
  context: AudioContext,
): Promise<AudioBuffer> {
  const src = sound.dataUrl || sound.url;
  if (!src) throw new Error('No audio source');

  let arrayBuffer: ArrayBuffer;

  if (src.startsWith('data:')) {
    // base64 data URL
    const binary = atob(src.split(',')[1] || src);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    arrayBuffer = bytes.buffer;
  } else {
    // remote URL
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
    arrayBuffer = await res.arrayBuffer();
  }

  return context.decodeAudioData(arrayBuffer);
}

/**
 * Export all bleep sounds as a SQLite database file.
 */
async function exportBleepSounds(sounds: Record<string, BleepSound>): Promise<void> {
  const initSqlJs = (await import('sql.js')).default;
  const sqlWasmUrl = (await import('sql.js/dist/sql-wasm.wasm')).default;
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });

  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS bleep_sounds (
      id       TEXT    PRIMARY KEY,
      label    TEXT    NOT NULL,
      url      TEXT    DEFAULT '',
      data     BLOB    DEFAULT NULL
    )
  `);

  const stmt = db.prepare('INSERT INTO bleep_sounds (id, label, url, data) VALUES (?, ?, ?, ?)');

  for (const sound of Object.values(sounds)) {
    if (sound.dataUrl) {
      // Extract raw bytes from base64 data URL
      const binary = atob(sound.dataUrl.split(',')[1] || sound.dataUrl);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      stmt.run([sound.id, sound.label, sound.url, bytes.buffer]);
    } else {
      stmt.run([sound.id, sound.label, sound.url, null]);
    }
  }

  stmt.free();

  const fileBytes = db.export();
  const blob = new Blob([fileBytes], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bleep-sounds-${Date.now()}.sqlite`;
  a.click();
  URL.revokeObjectURL(url);
  db.close();
}

/**
 * Import bleep sounds from a SQLite database file.
 */
async function importBleepSounds(
  file: File,
  onAdd: (id: string, label: string, url: string, fileData?: ArrayBuffer) => void,
): Promise<number> {
  const initSqlJs = (await import('sql.js')).default;
  const sqlWasmUrl = (await import('sql.js/dist/sql-wasm.wasm')).default;
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });

  const buffer = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));

  // Check that the table exists
  const tableCheck = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='bleep_sounds'`,
  );
  if (!tableCheck.length || !tableCheck[0].values?.length) {
    db.close();
    throw new Error('File is not a valid bleep sounds SQLite export');
  }

  const rows = db.exec('SELECT id, label, url, data FROM bleep_sounds');
  let count = 0;

  if (rows.length && rows[0].values) {
    for (const row of rows[0].values) {
      const [id, label, url, data] = row as [string, string, string, ArrayBuffer | string | null];

      if (data instanceof ArrayBuffer) {
        // Convert to base64 for in-memory store
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = btoa(binary);
        const dataUrl = `data:audio/*;base64,${base64}`;
        onAdd(id, label, url, data);
      } else if (typeof data === 'string') {
        onAdd(id, label, data);
      } else if (url) {
        onAdd(id, label, url);
      }

      count++;
    }
  }

  db.close();
  return count;
}

// --- Icons ---

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const UploadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17,8 12,3 7,8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
  </svg>
);

const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
  </svg>
);

const LoadingIcon = () => (
  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
    <path d="M12 2a10 10 0 0110 10" strokeOpacity="0.75" />
  </svg>
);

const SaveIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17,21 17,13 7,13 7,21" />
    <polyline points="7,3 7,8 15,8" />
  </svg>
);

const SavedIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17,21 17,13 7,13 7,21" />
    <polyline points="7,3 7,8 15,8" />
    <path d="M9 15l2 2 4-4" />
  </svg>
);

// --- Add Modal ---

interface AddModalProps {
  onAdd: (id: string, label: string, url: string, fileData?: ArrayBuffer) => void;
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
      const arrayBuffer = await file.arrayBuffer();

      // base64 for in-memory store
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const id = uid();
      onAdd(id, labelText, base64, arrayBuffer);
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
      onAdd(id, labelText, trimmed);
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

// --- Sound Row ---

interface SoundRowProps {
  sound: BleepSound;
  loading: boolean;
  onDownload: (id: string) => void;
  isDownloading: boolean;
  onUpdateLabel: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onPlay: (buffer: AudioBuffer) => void;
  onDecode: (id: string) => void;
}

const SoundRow = memo(({
  sound, loading, onDownload, isDownloading, onUpdateLabel, onRemove, onPlay, onDecode,
}: SoundRowProps) => {
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

  const hasBlob = !!sound.dataUrl;

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded bg-zinc-700">
      {/* Play / decode button */}
      {sound.audioBuffer ? (
        <button
          onClick={() => onPlay(sound.audioBuffer)}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-400"
          aria-label="Preview"
          title="Preview sound"
        >
          <PlayIcon />
        </button>
      ) : loading ? (
        <button disabled className="p-1 rounded text-zinc-500" title="Decoding...">
          <LoadingIcon />
        </button>
      ) : (
        <button
          onClick={() => onDecode(sound.id)}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300"
          aria-label="Load sound"
          title="Load sound (decode on demand)"
        >
          <PlayIcon />
        </button>
      )}

      {/* Download blob button — only if URL exists and not yet saved */}
      {!hasBlob && sound.url && (isDownloading ? (
        <button disabled className="p-1 rounded text-zinc-500" title="Downloading to IndexedDB...">
          <LoadingIcon />
        </button>
      ) : (
        <button
          onClick={() => onDownload(sound.id)}
          className="p-1 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300"
          title="Download to IndexedDB (save as blob)"
        >
          <SaveIcon />
        </button>
      ))}

      {/* Saved indicator — blob is in IndexedDB */}
      {hasBlob && (
        <span className="text-zinc-500" title="Saved in IndexedDB">
          <SavedIcon />
        </span>
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

      {/* URL badge */}
      {sound.url && (
        <span className="text-[10px] text-zinc-500" title={sound.url}>url</span>
      )}

      {/* Blob badge */}
      {hasBlob && (
        <span className="text-[10px] text-zinc-500" title="Stored in IndexedDB">blob</span>
      )}

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

// --- Main Manager ---

const BleepSoundManagerInner = () => {
  const bleepSounds = usePlayerStore((state) => state.bleepSounds);
  const actions = usePlayerActions();
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Hydrate from IndexedDB on mount
  useEffect(() => {
    hydrateBleepSounds();
  }, []);

  // Decode sounds on mount (lazy, in background)
  useEffect(() => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    const ids = Object.keys(bleepSounds);
    if (ids.length === 0) return;

    for (const id of ids) {
      const sound = bleepSounds[id];
      if (sound.audioBuffer) continue;

      setLoadingIds((prev) => new Set(prev).add(id));

      decodeAudio(sound, ctx)
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
    (id: string, label: string, url: string, fileData?: ArrayBuffer) => {
      actions.addBleepSound(id, label, url, fileData);
    },
    [actions],
  );

  const handleDecode = useCallback(
    (id: string) => {
      const sound = bleepSounds[id];
      if (!sound) return;

      setLoadingIds((prev) => new Set(prev).add(id));

      decodeAudio(sound, getAudioCtx())
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

  const handleDownload = useCallback(
    async (id: string) => {
      setDownloadingIds((prev) => new Set(prev).add(id));
      try {
        await actions.downloadUrlSound(id);
      } catch {
        // error handled in action
      } finally {
        setDownloadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [actions],
  );

  const handleExport = useCallback(() => {
    exportBleepSounds(bleepSounds);
  }, [bleepSounds]);

  const importInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const count = await importBleepSounds(file, async (id, label, url, fileData) => {
        await actions.addBleepSound(id, label, url, fileData);
      });
      alert(`Imported ${count} sound(s)`);
    } catch (err) {
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }, [actions]);

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <h2 className="text-sm font-semibold text-zinc-300 mb-3">Bleep Sounds</h2>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setShowAddModal(true)}
          className="flex-1 flex items-center justify-center gap-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded transition-colors"
        >
          <PlusIcon /> Add Sound
        </button>
        <button
          onClick={() => importInputRef.current?.click()}
          className="flex items-center justify-center gap-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded transition-colors"
          title="Import sounds from SQLite"
        >
          <UploadIcon />
        </button>
        <button
          onClick={handleExport}
          disabled={Object.keys(bleepSounds).length === 0}
          className="flex items-center justify-center gap-2 text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Export sounds to SQLite"
        >
          <DownloadIcon />
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".sqlite,.db"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {Object.keys(bleepSounds).length > 0 ? (
        <div className="space-y-2">
          {Object.values(bleepSounds).map((sound) => (
            <SoundRow
              key={sound.id}
              sound={sound}
              loading={loadingIds.has(sound.id)}
              onDownload={handleDownload}
              isDownloading={downloadingIds.has(sound.id)}
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
