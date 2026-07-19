import { memo, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { canFreeTopup } from '../../utils/auth';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { List, useListRef } from 'react-window';
import { EffectModal, EffectBadge } from './EffectModal';
import { LoginModal } from '../auth/LoginModal';
import { TopupModal } from '../auth/TopupModal';
import { ConfirmationModal } from '../auth/ConfirmationModal';
import type { SoundCensoringEffect, TranscriptionResultTuple } from '../../types';
import { cdBtn, cdInset } from '../player/cdBtn';
import { ShieldButton } from '../player/ShieldButton';

// Worker instances are created once and reused.
let importWorker: Worker | null = null;
let jsonExportWorker: Worker | null = null;

// ─── Row height for virtualization ─────────────────────────────
const ROW_HEIGHT = 36;
const LIST_HEIGHT = 400;

// ─── Shared border + subtitle section ────────────────────────────
const BORDERED_SECTION = 'relative border border-zinc-600 rounded-xl p-3';
const SUBTITLE = 'absolute -top-[7px] right-3 bg-zinc-800 px-2 text-[10px] text-zinc-500 font-semibold uppercase tracking-wider';

function BorderedSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`${BORDERED_SECTION} ${className ?? ''}`}>
      <span className={SUBTITLE}>{title}</span>
      {children}
    </div>
  );
}

// ─── Icons ─────────────────────────────────────────────────────
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// ─── SegmentItem ────────────────────────────────────────────────
const SegmentItem = memo(({
  start,
  end,
  text,
  triggered,
  rowEffects,
  isHighlighted,
  highlightedText,
  onJump,
  onAddEffect,
  onRemoveEffect,
  onEditEffect,
  formatTime,
}: {
  start: number;
  end: number;
  text: string;
  triggered: { slug: string; count: number }[];
  rowEffects: SoundCensoringEffect[];
  isHighlighted: boolean;
  highlightedText: { key: string; highlighted: boolean; content: string }[] | null;
  onJump: (time: number) => void;
  onAddEffect: (start: number) => void;
  onRemoveEffect: (id: string) => void;
  onEditEffect: (effect: SoundCensoringEffect) => void;
  formatTime: (seconds: number) => string;
}) => {
  const hasMatches = triggered.length > 0;
  const bgClass = isHighlighted
    ? 'bg-purple-900/40 ring-2 ring-purple-500/50'
    : hasMatches
      ? 'bg-zinc-700 hover:bg-zinc-600 ring-1 ring-red-800/50'
      : 'bg-zinc-700 hover:bg-zinc-600';

  return (
    <div className={`flex items-center gap-2 text-xs py-1 px-2 rounded cursor-pointer transition-colors ${bgClass}`} data-segment={start} id={`seg-${start}`} onClick={() => onJump(start)}>
      <span className="timestamp text-zinc-400 whitespace-nowrap">
        <span
          className="cursor-pointer hover:text-purple-300"
          title={start.toFixed(2) + 's'}
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(start.toFixed(2)); }}
        >
          {formatTime(start)}
        </span>
        <span className="text-zinc-500"> — </span>
        <span
          className="cursor-pointer hover:text-purple-300"
          title={end.toFixed(2) + 's'}
          onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(end.toFixed(2)); }}
        >
          {formatTime(end)}
        </span>
      </span>
      <span className="text text-zinc-200 flex-1 truncate" title={text}>
        {highlightedText
          ? highlightedText.map((part) =>
              part.highlighted ? (
                <mark key={part.key} className="bg-yellow-900/60 text-yellow-200 rounded px-0.5">
                  {part.content}
                </mark>
              ) : (
                <span key={part.key}>{part.content}</span>
              ),
            )
          : text}
      </span>
      <div className="flex items-center gap-1">
        {triggered.map(({ slug, count }) => (
          <span key={slug} className="px-1 py-0.5 bg-purple-900/30 text-purple-400 rounded">
            {slug} ×{count}
          </span>
        ))}
        {rowEffects.map((effect) => (
          <EffectBadge
            key={effect.id}
            effect={effect}
            onRemove={onRemoveEffect}
            onEdit={onEditEffect}
          />
        ))}
        <button
          onClick={(e) => { e.stopPropagation(); onAddEffect(start); }}
          className="text-xs text-blue-400 hover:text-blue-300 px-1 py-0.5 hover:bg-blue-900/30 rounded flex items-center gap-1"
          title="Add effect"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
          </svg>
          Effect
        </button>
      </div>
    </div>
  );
});
SegmentItem.displayName = 'SegmentItem';

// ─── RowRenderer — receives index, style, and rowProps from react-window ───
function TranscriptionRow(props: { index: number; style: React.CSSProperties; closestStart: number | null }) {
  const { index, style, closestStart } = props;
  const deps = rowRendererDeps;
  const [start, end, text] = deps.filteredSegments[index];
  const triggered = deps.dictMatches?.get(start) ?? [];
  const rowEffects = deps.segmentEffects.get(start) ?? [];
  const isHighlighted = start === closestStart;
  const highlightedText = deps.highlightCache.get(start) ?? null;

  return (
    <div style={style} className="h-full">
      <SegmentItem
        start={start}
        end={end}
        text={text}
        triggered={triggered}
        rowEffects={rowEffects}
        isHighlighted={isHighlighted}
        highlightedText={highlightedText}
        onJump={deps.onJump}
        onAddEffect={deps.onAddEffect}
        onRemoveEffect={deps.onRemoveEffect}
        onEditEffect={deps.onEditEffect}
        formatTime={deps.formatTime}
      />
    </div>
  );
}

/**
 * Shared mutable bag so TranscriptionRow can read current values
 * without re-rendering on every change. react-window calls the row
 * component with current props on each visible row.
 */
const rowRendererDeps = {
  filteredSegments: [] as [number, number, string][],
  dictMatches: null as Map<number, { slug: string; count: number }[]> | null,
  segmentEffects: new Map<number, SoundCensoringEffect[]>(),
  highlightCache: new Map<number, { key: string; highlighted: boolean; content: string }[] | null>(),
  onJump: (_time: number) => {},
  onAddEffect: (_start: number) => {},
  onRemoveEffect: (_id: string) => {},
  onEditEffect: (_effect: SoundCensoringEffect) => {},
  formatTime: (_seconds: number) => '',
};

// ─── Helpers ───────────────────────────────────────────────────
/**
 * Binary-search the segment containing *time* (segments are sorted by start).
 */
function findClosestSegment(
  segments: Array<[number, number, string]> | null,
  time: number,
): number | null {
  if (!segments || segments.length === 0) return null;
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid][0] <= time) lo = mid + 1;
    else hi = mid - 1;
  }
  if (hi >= 0 && time <= segments[hi][1]) return segments[hi][0];

  const a = segments[Math.max(0, hi)][0];
  const b = segments[Math.min(segments.length - 1, lo)][0];
  return Math.abs(time - a) <= Math.abs(time - b) ? a : b;
}

/**
 * Find the index of a segment by its start time in the filtered list.
 */
function findSegmentIndex(
  filtered: [number, number, string][],
  start: number,
): number {
  let lo = 0, hi = filtered.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (filtered[mid][0] < start) lo = mid + 1;
    else if (filtered[mid][0] > start) hi = mid - 1;
    else return mid;
  }
  return -1;
}

/**
 * Parse stage strings into { label, pct }:
 *   "Encoding — 1,234 / 5,678 (42%)"       → label + pct
 *   "Transcribing — 45% · 3/8 · 120s"     → label + pct
 *   "Remuxing audio — 12,345 packets"     → label, no pct
 *   "Sending to server…"                  → label, no pct
 */
function parseStage(stage: string): { label: string; pct: number | null } {
  const m = stage.match(/^(.+?)\s+—\s+\d+[,\d\s]*\s*\/\s*\d+[,\d\s]*\s*\((\d+)%\)$/);
  if (m) return { label: m[1].trim(), pct: parseInt(m[2], 10) };
  const m2 = stage.match(/^(.+?)\s+—\s+(\d+)%/);
  if (m2) return { label: m2[1].trim(), pct: parseInt(m2[2], 10) };
  const m3 = stage.match(/^(.+?)\s+—\s+(\d+[,\d\s]*)\s*\/\s*(\d+[,\d\s]*)$/);
  if (m3) {
    const done = parseFloat(m3[2].replace(/,/g, ''));
    const total = parseFloat(m3[3].replace(/,/g, ''));
    return { label: m3[1].trim(), pct: Math.round((done / total) * 100) };
  }
  return { label: stage, pct: null };
}

function TranscribeProgressBar({ stage }: { stage: string }) {
  const { label, pct } = parseStage(stage);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-zinc-400">
        <span>{label}</span>
        {pct != null && <span>{pct}%</span>}
      </div>
      <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
        <div
          className={`bg-purple-500 h-1.5 rounded-full transition-all duration-200 ${pct == null ? 'animate-pulse' : ''}`}
          style={{ width: pct != null ? `${pct}%` : '100%' }}
        />
      </div>
    </div>
  );
}

/**
 * Standalone progress bar during transcription.
 * Subscribes only to transcribeStage — the main TranscriptionResults
 * component doesn't re-render on every stage update, avoiding expensive
 * re-renders of the transcription list while video is playing.
 */
function TranscribeProgress() {
  const transcribeStage = usePlayerStore((state) => state.transcribeStage);

  return (
    <div className="text-xs py-2">
      {transcribeStage ? (
        <TranscribeProgressBar stage={transcribeStage} />
      ) : (
        <div className="text-zinc-500">Transcribing...</div>
      )}
    </div>
  );
}

const TranscriptionResultsInner = () => {
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const transcribing = usePlayerStore((state) => state.transcribing);
  const duration = usePlayerStore((state) => state.duration);
  const censoringEffects = usePlayerStore((state) => state.censoringEffects);
  const loadedDictionaries = usePlayerStore((state) => state.loadedDictionaries);
  const activeDictionaries = usePlayerStore((state) => state.activeDictionaries);
  const actions = usePlayerActions();
  const { transcribe, seekToTime, getPlaybackTime } = useMediaPlayerContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMatchesOnly, setShowMatchesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const autoScroll = usePlayerStore((state) => state.autoScroll);

  // Effect modal — add mode
  const [modalSegment, setModalSegment] = useState<number | null>(null);
  // Effect modal — edit mode
  const [editEffect, setEditEffect] = useState<SoundCensoringEffect | null>(null);

  // Add Word inline form
  const [addWordStart, setAddWordStart] = useState('');
  const [addWordEnd, setAddWordEnd] = useState('');
  const [addWordText, setAddWordText] = useState('');
  const [addWordError, setAddWordError] = useState<string | null>(null);

  const handleAddWordSubmit = () => {
    setAddWordError(null);
    const s = parseFloat(addWordStart);
    const e = parseFloat(addWordEnd);
    if (isNaN(s) || s < 0) { setAddWordError('Invalid start time'); return; }
    if (isNaN(e) || e <= s) { setAddWordError('End must be greater than start'); return; }
    if (duration && e > duration) { setAddWordError('End exceeds media duration'); return; }
    if (!addWordText.trim()) { setAddWordError('Word is required'); return; }
    handleAddWord(s, e, addWordText.trim());
    setAddWordStart('');
    setAddWordEnd('');
    setAddWordText('');
  };

  // Auth modals — one state, can't conflict
  // Restore from IndexedDB on mount (survives OIDC redirect)
  const [authModal, setAuthModal] = useState<'login' | 'topup' | 'confirm' | null>(null);
  const [authModalError, setAuthModalError] = useState<string | null>(null);
  // Use ref for retry callback — React's setState treats functions as reducers,
  // so storing a function in state causes it to be called immediately.
  const authModalRetryRef = useRef<(() => Promise<void>) | null>(null);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const authUser = useAuthStore((s) => s.user);
  const authError = useAuthStore((s) => s.error);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const clearAuthError = useAuthStore((s) => s.clearError);

  // Restore authModal state from IndexedDB on mount (OIDC callback flow)
  useEffect(() => {
    const restoreAuthModal = async () => {
      try {
        const { loadSession } = await import('../../utils/idb');
        const session = await loadSession();
        if (!session || !session.authModal) return;

        // If we're in the OIDC callback flow (code= in URL), skip the login
        // modal — the user is about to be authenticated. Set 'confirm' directly
        // so the authModal effect does the balance check without flickering.
        const params = new URLSearchParams(window.location.search);
        const isInCallback = params.has('code');
        setAuthModal(isInCallback ? 'confirm' : session.authModal);
      } catch (err) {
        console.error('Failed to restore authModal:', err);
      }
    };
    restoreAuthModal();
  }, []);

  const handleAddEffect = (effect: SoundCensoringEffect) => {
    actions.addSoundEffect(effect);
  };

  const handleUpdateEffect = (id: string, updates: Partial<SoundCensoringEffect>) => {
    actions.updateSoundEffect(id, updates);
  };

  const handleAddWord = (start: number, end: number, text: string) => {
    const current: TranscriptionResultTuple[] = transcriptionResults ?? [];
    const newResults: TranscriptionResultTuple[] = [...current, [start, end, text]];
    newResults.sort((a, b) => a[0] - b[0]);
    actions.setTranscriptionResults(newResults.length ? newResults : null);
  };

  const handleRemoveEffect = (id: string) => {
    actions.removeSoundEffect(id);
  };

  // JSON export / import
  const importJsonRef = useRef<HTMLInputElement>(null);

  const handleExportJson = async () => {
    if (!transcriptionResults) return;

    if (!jsonExportWorker) {
      jsonExportWorker = new Worker(
        '/json-export.worker.js',
      );
    }

    const transcriptionData = transcriptionResults.map(([start, end, text]) => ({
      start,
      end,
      text,
    }));

    const effects = (censoringEffects ?? []).filter(
      (e): e is SoundCensoringEffect => e.effectType === 'sound',
    );

    const text = await new Promise<string>((resolve, reject) => {
      jsonExportWorker!.postMessage({
        type: 'EXPORT_JSON',
        payload: { transcription: transcriptionData, effects },
      });
      jsonExportWorker!.onmessage = (ev) => {
        if (ev.data.type === 'JSON_READY') resolve(ev.data.payload);
        else if (ev.data.type === 'ERROR') reject(new Error(ev.data.payload));
      };
      jsonExportWorker!.onerror = (ev) => reject(new Error(ev.message));
    });

    const fileName = usePlayerStore.getState().fileName || 'transcription';
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_transcription.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!importWorker) {
      importWorker = new Worker(
        '/json-import.worker.js',
      );
    }

    actions.setImporting(true);
    actions.setImportStage(`Reading file... (${(file.size / 1024).toFixed(0)} KB)`);

    try {
      const text = await file.text();
      await new Promise((r) => requestAnimationFrame(r));

      actions.setImportStage('Parsing JSON...');

      const [results, effects] = await new Promise<[[number, number, string][], SoundCensoringEffect[]]>((resolve, reject) => {
        importWorker!.postMessage({ type: 'PARSE', payload: { text } });
        importWorker!.onmessage = (ev) => {
          if (ev.data.type === 'PARSED') {
            resolve([ev.data.payload.results, ev.data.payload.effects] as [[number, number, string][], SoundCensoringEffect[]]);
          } else if (ev.data.type === 'ERROR') {
            reject(new Error(ev.data.payload));
          } else if (ev.data.type === 'LOG') {
            console.log('[json-import]', ev.data.payload);
            actions.setImportStage(ev.data.payload);
          }
        };
        importWorker!.onerror = (ev) => reject(new Error('Worker crash: ' + (ev.message || 'unknown error')));
      });

      actions.setImportStage(`Importing transcription... ${results.length} segments`);
      actions.setTranscriptionResults(results);

      await new Promise((r) => requestAnimationFrame(r));

      actions.setImportStage(`Importing effects... ${effects.length} sound effects`);
      actions.setCensoringEffects(effects);

      await new Promise((r) => requestAnimationFrame(r));

      await new Promise(r => setTimeout(r, 200));
      actions.setImportStage('Done ✓');
      setError(null);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('[import] Failed:', detail, err);
      setError(`Import failed: ${detail}`);
      actions.setImportStage(`Import failed ✗ — ${detail}`);
    } finally {
      if (importJsonRef.current) importJsonRef.current.value = '';
      setTimeout(() => {
        actions.setImportDone();
      }, 800);
    }
  };

  // ─── Optimized: segmentEffects with useMemo ───────────────────
  const segmentEffects = useMemo(() => {
    const map = new Map<number, SoundCensoringEffect[]>();
    for (const e of (censoringEffects ?? [])) {
      if (e.effectType === 'sound') {
        const list = map.get(e.segmentStart) ?? [];
        list.push(e as SoundCensoringEffect);
        map.set(e.segmentStart, list);
      }
    }
    return map;
  }, [censoringEffects]);

  // Dictionary matches — computed asynchronously after the first render
  // so Aho-Corasick doesn't block the video rAF loop.
  const [dictMatches, setDictMatches] = useState<Map<number, { slug: string; count: number }[]> | null>(null);
  const matchesVersionRef = useRef(0);

  useEffect(() => {
    if (!transcriptionResults) {
      setDictMatches(null);
      return;
    }

    const version = ++matchesVersionRef.current;

    setTimeout(() => {
      if (version !== matchesVersionRef.current) return;

      const map = new Map<number, { slug: string; count: number }[]>();
      for (const [start, _end, text] of transcriptionResults) {
        const triggered: { slug: string; count: number }[] = [];
        for (const slug of activeDictionaries) {
          const dict = loadedDictionaries[slug];
          if (!dict) continue;
          const matches = dict.scanner.findMatches(text.toLowerCase());
          if (matches.length > 0) triggered.push({ slug, count: matches.length });
        }
        if (triggered.length > 0) map.set(start, triggered);
      }
      setDictMatches(map);
    }, 0);
  }, [transcriptionResults, activeDictionaries, loadedDictionaries]);

  // closestSegmentStart — ref for interval comparison (avoids stale closure),
  // state for react-window rowProps (triggers visible row re-render)
  const closestRef = useRef<number | null>(null);
  const [closestStart, setClosestStart] = useState<number | null>(null);

  // react-window v2 list ref
  const rwListRef = useListRef(null);

  // Filter segments by search/matches-only
  const filteredSegments = useMemo(() => {
    if (!transcriptionResults) return [];
    return transcriptionResults.filter(([start, _end, text]) => {
      if (showMatchesOnly && !dictMatches?.has(start)) return false;
      if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [transcriptionResults, showMatchesOnly, dictMatches, searchQuery]);

  useEffect(() => {
    // Apply highlight to a segment — DOM-only, no React re-render
    const applyHighlight = (closest: number | null, scroll: boolean) => {
      if (closest == null) return;
      const el = document.getElementById(`seg-${closest}`);
      if (el) {
        el.classList.remove('bg-zinc-700');
        el.classList.add('bg-purple-900/40', 'ring-2', 'ring-purple-500/50');
        if (scroll) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    };

    const removeHighlight = (closest: number | null) => {
      if (closest == null) return;
      const el = document.getElementById(`seg-${closest}`);
      if (el) {
        el.classList.remove('bg-purple-900/40', 'ring-2', 'ring-purple-500/50');
        el.classList.add('bg-zinc-700');
      }
    };

    // Initial highlight on mount / when transcriptionResults changes
    const t = getPlaybackTime();
    const newClosest = findClosestSegment(transcriptionResults, t);
    closestRef.current = newClosest;
    applyHighlight(newClosest, false);

    const interval = setInterval(() => {
      const t = getPlaybackTime();
      const newClosest = findClosestSegment(transcriptionResults, t);
      if (newClosest === closestRef.current) return;

      removeHighlight(closestRef.current);
      closestRef.current = newClosest;
      applyHighlight(newClosest, true);
    }, 500);

    return () => clearInterval(interval);
  }, [transcriptionResults, getPlaybackTime]);

  // Optimized highlightSearch — returns null when no search
  const highlightSearch = useCallback((text: string): { key: string; highlighted: boolean; content: string }[] | null => {
    if (!searchQuery) return null;
    const parts: { key: string; highlighted: boolean; content: string }[] = [];
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
  }, [searchQuery]);

  // Pre-compute highlight cache for filtered segments (only when searchQuery is non-empty)
  const highlightCache = useMemo(() => {
    if (!searchQuery) return new Map<number, { key: string; highlighted: boolean; content: string }[] | null>();
    const cache = new Map<number, { key: string; highlighted: boolean; content: string }[] | null>();
    for (const [start, _end, text] of filteredSegments) {
      cache.set(start, highlightSearch(text));
    }
    return cache;
  }, [filteredSegments, searchQuery, highlightSearch]);

  const handleJumpToTime = useCallback((time: number) => {
    seekToTime(time);
    document.getElementById('videoCanvas')?.scrollIntoView({ behavior: 'smooth' });
  }, [seekToTime]);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Update rowRendererDeps so TranscriptionRow can access current values
  rowRendererDeps.filteredSegments = filteredSegments;
  rowRendererDeps.dictMatches = dictMatches;
  rowRendererDeps.segmentEffects = segmentEffects;
  rowRendererDeps.highlightCache = highlightCache;
  rowRendererDeps.onJump = handleJumpToTime;
  rowRendererDeps.onAddEffect = (start: number) => setModalSegment(start);
  rowRendererDeps.onRemoveEffect = handleRemoveEffect;
  rowRendererDeps.onEditEffect = (effect: SoundCensoringEffect) => setEditEffect(effect);
  rowRendererDeps.formatTime = formatTime;

  // Auto-scroll and highlight tracking
  useEffect(() => {
    if (!transcriptionResults) return;

    const t = getPlaybackTime();
    const newClosest = findClosestSegment(transcriptionResults, t);
    closestRef.current = newClosest;
    setClosestStart(newClosest);

    const interval = setInterval(() => {
      const t = getPlaybackTime();
      const newClosest = findClosestSegment(transcriptionResults, t);
      if (newClosest === closestRef.current) return;

      closestRef.current = newClosest;
      setClosestStart(newClosest);

      // Auto-scroll only when video is playing
      const isPlaying = usePlayerStore.getState().isPlaying;
      if (autoScroll && isPlaying && rwListRef.current && newClosest != null) {
        const idx = findSegmentIndex(filteredSegments, newClosest);
        if (idx >= 0) {
          rwListRef.current.scrollToRow({ index: idx, behavior: 'smooth', align: 'center' });
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [transcriptionResults, getPlaybackTime, autoScroll, filteredSegments, rwListRef, closestRef]);

  const _handleTranscribe = async () => {
    // 1. Check auth against backend (needed to get fresh balance)
    // Retry up to 3 times on network errors (localtunnel can be flaky)
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await checkAuth();
        break;
      } catch {
        // ignore — checkAuth sets error in store
      }
      const lastErr = useAuthStore.getState().error;
      if (!lastErr) break; // not a network error, move on
      // Brief pause before retry
      await new Promise(r => setTimeout(r, 1000));
    }

    const authErr = useAuthStore.getState().error;

    if (authErr) {
      // Backend error — show with retry
      setAuthModalError(authErr);
      authModalRetryRef.current = async () => {
        setAuthModal(null);
        _handleTranscribe();
      };
      setAuthModal('login');
      return;
    }

    const user = useAuthStore.getState().user;
    if (!user) {
      // Not logged in — save session and show login
      const { saveSession } = await import('../../utils/idb');
      await saveSession({
        authModal: 'login',
        transcriptionResults,
        censoringEffects: censoringEffects ?? null,
        duration,
        wasTranscribing: transcribing,
      });
      setAuthModalError(null);
      authModalRetryRef.current = null;
      setAuthModal('login');
      return;
    }

    // 2. Check if topup modal should show:
    //    a) 30+ days since last free topup — user can get free hours
    //    b) video duration > user balance — user needs more hours
    const videoDuration = duration;
    const freeAvailable = canFreeTopup(user.last_free_topup);
    const balanceInsufficient = videoDuration > user.remaining_seconds;

    if (freeAvailable || balanceInsufficient) {
      setAuthModal('topup');
      return;
    }

    // 3. Show confirmation modal
    setAuthModal('confirm');
  };

  const handleTranscribe = _handleTranscribe;

  // React to login: when user gets authenticated, handle it
  // Guard: don't switch modals if there's an auth error — that would create a loop
  useEffect(() => {
    if ((authModal === 'login' || authModal === 'confirm') && isAuthenticated && !authError) {
      // Already authenticated — check balance from store, skip checkAuth
      // (localtunnel can be flaky and 502 will block the flow)
      const user = useAuthStore.getState().user;
      if (user) {
        const freeAvailable = canFreeTopup(user.last_free_topup);
        const balanceInsufficient = duration > user.remaining_seconds;
        if (freeAvailable || balanceInsufficient) {
          setAuthModal('topup');
        } else {
          setAuthModal('confirm');
        }
      }
    }
  }, [isAuthenticated, authModal, authError]);

  // Confirm and transcribe
  const handleConfirmTranscribe = async () => {
    setAuthModal(null);
    setIsLoading(true);
    setError(null);
    try {
      await transcribe();
      setIsLoading(false);
      await checkAuth();
    } catch (err) {
      const msg = (err as Error).message;
      console.error('Transcription error:', msg);
      if (msg.includes('402') || msg.includes('quota')) {
        setAuthModal('topup');
      } else {
        setError('Failed to transcribe: ' + msg);
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="relative bg-zinc-800 rounded-xl p-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]">
      {/* 3D inner bevel highlight */}
      <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none" />
      {/* Header — title + JSON actions */}
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="block text-base sm:text-lg font-semibold text-zinc-300 shrink-0">Transcription</h2>
        <div className="flex items-center gap-2">
          {/* Import JSON */}
          <button
            onClick={() => importJsonRef.current?.click()}
            className={`${cdBtn} text-xs font-semibold px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 shrink-0 flex items-center gap-1`}
            title="Import transcription + effects from JSON"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Import
          </button>
          {/* Export JSON */}
          <button
            data-testid="export-json"
            onClick={handleExportJson}
            disabled={!transcriptionResults}
            className={`${cdBtn} text-xs font-semibold px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 shrink-0 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1`}
            title="Export transcription + effects to JSON"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
          <input
            ref={importJsonRef}
            type="file"
            accept=".json"
            onChange={handleImportJson}
            className="hidden"
          />
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 p-3 bg-red-900/20 rounded space-y-1">
          <div className="font-semibold">{error}</div>
          <div className="text-[11px] text-red-400/70">
            Check the browser console for details. If the file was exported from another session, it may have an outdated format.
          </div>
        </div>
      )}

      <div className="mb-3">
        <BorderedSection title="Filters">
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex items-center">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className={`${cdInset} text-xs bg-zinc-900 text-zinc-200 placeholder-zinc-500 rounded px-2 py-1.5 focus:outline-none focus:border-t-purple-500 focus:border-l-purple-500 w-28`}
              />
              <span className={`absolute right-2 w-1.5 h-1.5 rounded-full ${
                searchQuery ? 'bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.7)]' : 'bg-red-800 shadow-none'
              }`} />
            </div>
            <ShieldButton
              active={showMatchesOnly}
              onClick={() => setShowMatchesOnly((v) => !v)}
              className="text-xs px-3 py-1.5"
              title="Show only dictionary matches"
            >
              Matches only
              <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1.5 ${
                showMatchesOnly ? 'bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.7)]' : 'bg-red-800 shadow-none'
              }`} />
            </ShieldButton>
          </div>
        </BorderedSection>
      </div>

      <div className="mb-3 flex justify-end">
        {/* Add Word */}
        <BorderedSection title="Add Word" className="shrink-0 max-w-xs">
          <form onSubmit={(e) => { e.preventDefault(); handleAddWordSubmit(); }} className="flex flex-col gap-1.5">
            <div className="flex gap-1.5 items-center">
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration?.toString()}
                value={addWordStart}
                onChange={(e) => setAddWordStart(e.target.value)}
                placeholder="Start"
                className={`${cdInset} w-20 bg-zinc-900 text-zinc-200 placeholder-zinc-500 rounded px-2 py-1 text-xs focus:outline-none focus:border-t-purple-500 focus:border-l-purple-500`}
                required
              />
              <input
                type="number"
                step="0.1"
                min="0"
                max={duration?.toString()}
                value={addWordEnd}
                onChange={(e) => setAddWordEnd(e.target.value)}
                placeholder="End"
                className={`${cdInset} w-20 bg-zinc-900 text-zinc-200 placeholder-zinc-500 rounded px-2 py-1 text-xs focus:outline-none focus:border-t-purple-500 focus:border-l-purple-500`}
                required
              />
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={addWordText}
                onChange={(e) => setAddWordText(e.target.value)}
                placeholder="Word…"
                className={`${cdInset} flex-1 bg-zinc-900 text-zinc-200 placeholder-zinc-500 rounded px-2 py-1 text-xs focus:outline-none focus:border-t-purple-500 focus:border-l-purple-500`}
                required
              />
              <button
                type="submit"
                className={`${cdBtn} px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-semibold flex items-center gap-1 shrink-0`}
              >
                <PlusIcon /> Add
              </button>
            </div>
            {addWordError && (
              <div className="text-[10px] text-red-400">{addWordError}</div>
            )}
          </form>
        </BorderedSection>
      </div>

      <BorderedSection title="Words">
        {transcribing ? (
          <TranscribeProgress />
        ) : isLoading && !transcriptionResults ? (
          <div className="text-xs text-zinc-500 py-2">Loading transcription...</div>
        ) : transcriptionResults && transcriptionResults.length > 0 ? (
          <List
            listRef={rwListRef}
            rowCount={filteredSegments.length}
            rowHeight={ROW_HEIGHT}
            // @ts-expect-error react-window v2 rowProps type inference bug
            rowProps={{ closestStart, effectVersion: censoringEffects?.length ?? 0 }}
            overscanCount={5}
            style={{ height: LIST_HEIGHT, width: '100%' }}
            rowComponent={TranscriptionRow}
          />
        ) : (
          <div className="text-xs text-zinc-500 py-2">No transcription data</div>
        )}
      </BorderedSection>

      {/* Effect modal — add mode */}
      {modalSegment != null && (
        <EffectModal
          segmentStart={modalSegment}
          onClose={() => setModalSegment(null)}
          onAdd={handleAddEffect}
        />
      )}

      {/* Effect modal — edit mode */}
      {editEffect && (
        <EffectModal
          segmentStart={editEffect.segmentStart}
          onClose={() => setEditEffect(null)}
          onAdd={handleAddEffect}
          onUpdate={handleUpdateEffect}
          effect={editEffect}
        />
      )}

       {/* Auth modals — only one at a time, rendered via Portal to avoid clipping */}
      {(authModal === 'login' || authModal === 'topup' || authModal === 'confirm') &&
        ReactDOM.createPortal(
          <div className="relative z-[100]">
            {authModal === 'login' && (
              <LoginModal
                onClose={() => setAuthModal(null)}
                onRetry={authModalRetryRef.current ?? undefined}
                initialError={authModalError}
              />
            )}
            {authModal === 'topup' && (
              <TopupModal
                onClose={() => {
                  setAuthModal(null);
                  clearAuthError();
                }}
                onTopup={async () => {
                  await checkAuth();
                  setAuthModal('confirm');
                }}
              />
            )}
            {authModal === 'confirm' && (
              <ConfirmationModal
                videoDuration={duration}
                onClose={() => setAuthModal(null)}
                onConfirm={handleConfirmTranscribe}
                onLogout={async () => {
                  await useAuthStore.getState().logout();
                  setAuthModal(null);
                }}
              />
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

export const TranscriptionResults = memo(TranscriptionResultsInner);
