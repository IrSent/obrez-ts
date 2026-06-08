import { memo, useEffect, useRef, useState } from 'react';
import { usePlayerStore, usePlayerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { EffectModal, EffectBadge } from './EffectModal';
import type { SoundCensoringEffect } from '../../types';

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
 * Parse "Stage — 1,234 / 5,678 (42%)" → { label, pct }
 * For non-numeric stages like "Sending to server…" → { label, pct: null }.
 */
function parseStage(stage: string): { label: string; pct: number | null } {
  const m = stage.match(/^(.+?)\s+—\s+\d+[,\d\s]*\s*\/\s*\d+[,\d\s]*\s*\((\d+)%\)$/);
  if (m) return { label: m[1].trim(), pct: parseInt(m[2], 10) };
  const m2 = stage.match(/^(.+?)\s+—\s+(\d+[,\d\s]*)\s*\/\s*(\d+[,\d\s]*)$/);
  if (m2) {
    const done = parseFloat(m2[2].replace(/,/g, ''));
    const total = parseFloat(m2[3].replace(/,/g, ''));
    return { label: m2[1].trim(), pct: Math.round((done / total) * 100) };
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

const TranscriptionResultsInner = () => {
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const transcribing = usePlayerStore((state) => state.transcribing);
  const transcribeStage = usePlayerStore((state) => state.transcribeStage);
  const censoringEffects = usePlayerStore((state) => state.censoringEffects);
  const loadedDictionaries = usePlayerStore((state) => state.loadedDictionaries);
  const activeDictionaries = usePlayerStore((state) => state.activeDictionaries);
  const actions = usePlayerActions();
  const { transcribe, seekToTime, getPlaybackTime } = useMediaPlayerContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMatchesOnly, setShowMatchesOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  // Effect modal
  const [modalSegment, setModalSegment] = useState<number | null>(null);

  const handleAddEffect = (effect: SoundCensoringEffect) => {
    actions.addSoundEffect(effect);
  };

  const handleRemoveEffect = (id: string) => {
    actions.removeSoundEffect(id);
  };

  // Build a quick lookup: segmentStart → SoundCensoringEffect[]
  const segmentEffects = new Map<number, SoundCensoringEffect[]>();
  for (const e of censoringEffects) {
    if (e.effectType === 'sound') {
      const list = segmentEffects.get(e.segmentStart) ?? [];
      list.push(e as SoundCensoringEffect);
      segmentEffects.set(e.segmentStart, list);
    }
  }

  // Dictionary matches — computed asynchronously after the first render
  // so Aho-Corasick doesn't block the video rAF loop.
  const [dictMatches, setDictMatches] = useState<Map<number, { slug: string; count: number }[]>>(null);
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

  // closestSegmentStart — ref, no React re-render
  const closestRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const applyHighlight = (closest: number | null, scroll: boolean) => {
      if (closest == null) return;
      const el = document.getElementById(`seg-${closest}`);
      if (el) {
        el.classList.remove('bg-zinc-700');
        el.classList.add('bg-purple-900/40', 'ring-2', 'ring-purple-500/50');

        if (scroll && listRef.current) {
          const container = listRef.current;
          const containerRect = container.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          // Center the element in the visible area of the container
          const targetScroll = container.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2);
          container.scrollTo({ top: targetScroll, behavior: 'smooth' });
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
      applyHighlight(newClosest, autoScroll);
    }, 500);

    return () => clearInterval(interval);
  }, [transcriptionResults, getPlaybackTime, autoScroll]);

  const handleTranscribe = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await transcribe();
      setIsLoading(false);
    } catch (err) {
      console.error('Transcription error:', err);
      setError('Failed to transcribe: ' + (err as Error).message);
      setIsLoading(false);
    }
  };

  const handleJumpToTime = (time: number) => {
    seekToTime(time);
    document.getElementById('videoCanvas')?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const highlightSearch = (text: string): Array<{ key: string; highlighted: boolean; content: string }> => {
    if (!searchQuery) {
      return [{ key: '', highlighted: false, content: text }];
    }
    const parts: Array<{ key: string; highlighted: boolean; content: string }> = [];
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
  };

  return (
    <div className="bg-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-sm font-semibold text-zinc-300 shrink-0">Transcription Results</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`p-1 rounded transition-colors shrink-0 ${autoScroll ? 'text-purple-400 bg-purple-900/30' : 'text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'}`}
            title={autoScroll ? 'Auto-scroll to current segment (ON)' : 'Auto-scroll to current segment (OFF)'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="2" width="18" height="20" rx="3" />
              <line x1="12" y1="10" x2="12" y2="16" />
              <polyline points="9 13 12 16 15 13" />
            </svg>
          </button>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="text-xs bg-zinc-700 text-zinc-200 placeholder-zinc-500 border border-zinc-600 rounded px-2 py-1 focus:outline-none focus:border-purple-500 w-32 shrink-0"
          />
          <button
            onClick={() => setShowMatchesOnly((v) => !v)}
            className={`text-xs px-2 py-1 rounded transition-colors shrink-0 ${showMatchesOnly ? 'bg-purple-900/50 text-purple-300' : 'text-purple-400 hover:bg-purple-900/30'}`}
            title="Show only dictionary matches"
          >
            Matches only
          </button>
          <button
            onClick={handleTranscribe}
            disabled={isLoading}
            className="text-xs font-semibold px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-colors shrink-0"
          >
            {transcribing ? 'Transcribing...' : isLoading ? 'Loading...' : 'Transcribe'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 text-xs text-red-400 p-2 bg-red-900/20 rounded">
          {error}
        </div>
      )}

      {transcribing ? (
        <div className="text-xs py-2">
          {transcribeStage ? (
            <TranscribeProgressBar stage={transcribeStage} />
          ) : (
            <div className="text-zinc-500">Transcribing...</div>
          )}
        </div>
      ) : isLoading && !transcriptionResults ? (
        <div className="text-xs text-zinc-500 py-2">Loading transcription...</div>
      ) : transcriptionResults && transcriptionResults.length > 0 ? (
        <div ref={listRef} className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
          {transcriptionResults.map(([start, end, text]) => {
            const triggered = dictMatches?.get(start) ?? [];

            if (showMatchesOnly && triggered.length === 0) {
              return null;
            }

            if (searchQuery && !text.toLowerCase().includes(searchQuery.toLowerCase())) {
              return null;
            }

            const highlightedText = highlightSearch(text);
            const hasMatches = triggered.length > 0;
            const rowEffects = segmentEffects.get(start) ?? [];
            const rowClass = `flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-zinc-700 ${hasMatches ? 'ring-1 ring-red-800/50' : ''}`;

            return (
              <div key={start} className={rowClass} data-segment={start} id={`seg-${start}`}>
                <span className="timestamp text-zinc-400 w-16">
                  {formatTime(start)}
                </span>
                <span className="text text-zinc-200 flex-1">
                  {highlightedText.map((part) =>
                    part.highlighted ? (
                      <mark key={part.key} className="bg-yellow-900/60 text-yellow-200 rounded px-0.5">
                        {part.content}
                      </mark>
                    ) : (
                      <span key={part.key}>{part.content}</span>
                    )
                  )}
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
                      onRemove={handleRemoveEffect}
                    />
                  ))}
                  <button
                    onClick={() => handleJumpToTime(start)}
                    className="text-xs text-purple-400 hover:text-purple-300 px-1 py-0.5 hover:bg-purple-900/30 rounded"
                  >
                    Jump
                  </button>
                  <button
                    onClick={() => setModalSegment(start)}
                    className="text-xs text-blue-400 hover:text-blue-300 px-1 py-0.5 hover:bg-blue-900/30 rounded"
                    title="Add effect"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs text-zinc-500 py-2">No transcription data</div>
      )}

      {/* Effect modal */}
      {modalSegment != null && (
        <EffectModal
          segmentStart={modalSegment}
          onClose={() => setModalSegment(null)}
          onAdd={handleAddEffect}
        />
      )}
    </div>
  );
};

export const TranscriptionResults = memo(TranscriptionResultsInner);
