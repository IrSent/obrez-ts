import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { usePlayerStore, playerActions } from '../../store/playerStore';

const SENTENCE_GAP = 1.5; // seconds — gap threshold to start a new paragraph

/**
 * Split sorted segments into groups (paragraphs) by time gap.
 * Consecutive segments within SENTENCE_GAP of each other belong to the same group.
 */
function groupIntoSentences(
  segments: Array<[number, number, string]>,
): Array<Array<[number, number, string]>> {
  if (segments.length === 0) return [];
  const groups: Array<Array<[number, number, string]>> = [[segments[0]]];
  for (let i = 1; i < segments.length; i++) {
    const prev = groups[groups.length - 1][groups[groups.length - 1].length - 1];
    if (segments[i][0] - prev[1] > SENTENCE_GAP) {
      groups.push([]);
    }
    groups[groups.length - 1].push(segments[i]);
  }
  return groups;
}

/**
 * Tooltip shown when clicking a word in the Text view.
 * Rendered via Portal to avoid clipping.
 */
function WordTooltip({
  segment,
  x,
  y,
  onClose,
  onAddEffect,
  onSeekTo,
  onProposeStart,
  onProposeEnd,
  proposedTime,
  formatTime,
}: {
  segment: [number, number, string];
  x: number;
  y: number;
  onClose: () => void;
  onAddEffect: (start: number) => void;
  onSeekTo: (time: number) => void;
  onProposeStart: () => void;
  onProposeEnd: () => void;
  proposedTime: number | null;
  formatTime: (s: number) => string;
}) {
  const [start, end, text] = segment;

  // Flip above if near bottom of viewport
  const tooltipH = 180;
  const flipped = y + tooltipH > window.innerHeight;
  const top = flipped ? y - tooltipH - 8 : y + 8;

  return ReactDOM.createPortal(
    <div
      data-tooltip="word"
      className="fixed z-[9999] bg-zinc-800 border border-zinc-500 rounded-lg p-3 text-xs shadow-[0_8px_30px_rgba(0,0,0,0.6)] min-w-[200px]"
      style={{ left: x, top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-zinc-300 mb-2 truncate" title={text}>
        {text}
      </div>
      <div className="flex flex-col gap-1.5">
        {/* Start time — clickable to propose */}
        <button
          onClick={onProposeStart}
          className={`text-left px-2 py-1 rounded transition-colors ${
            proposedTime === start
              ? 'bg-purple-900/60 text-purple-200 ring-1 ring-purple-500'
              : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
          }`}
          title="Click to propose this as start time"
        >
          <span className="text-zinc-400">Start:</span>{' '}
          <span className="font-mono">{formatTime(start)} <span className="text-zinc-500">({start.toFixed(2)}s)</span></span>
        </button>

        {/* End time — clickable to propose */}
        <button
          onClick={onProposeEnd}
          className={`text-left px-2 py-1 rounded transition-colors ${
            proposedTime === end
              ? 'bg-purple-900/60 text-purple-200 ring-1 ring-purple-500'
              : 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
          }`}
          title="Click to propose this as end time"
        >
          <span className="text-zinc-400">End:</span>{' '}
          <span className="font-mono">{formatTime(end)} <span className="text-zinc-500">({end.toFixed(2)}s)</span></span>
        </button>

        <div className="border-t border-zinc-600 my-1" />

        {/* Add Effect */}
        <button
          onClick={() => {
            onAddEffect(start);
            onClose();
          }}
          className="text-left px-2 py-1 rounded bg-purple-900/40 text-purple-300 hover:bg-purple-800/50 transition-colors flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M13 2L3 14h9l-1 10 10-12h-9l1-10z" />
          </svg>
          Add effect
        </button>

        {/* Seek to */}
        <button
          onClick={() => {
            onSeekTo(start);
            onClose();
          }}
          className="text-left px-2 py-1 rounded bg-blue-900/40 text-blue-300 hover:bg-blue-800/50 transition-colors flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          Seek to
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * A single word. Clicking opens the tooltip.
 * If matched by dictionary, shown with red wavy underline.
 */
function WordSpan({
  word,
  segment,
  onClick,
  matched,
}: {
  word: string;
  segment: [number, number, string];
  onClick: (wordEl: HTMLElement, segment: [number, number, string]) => void;
  matched: boolean;
}) {
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (el) el.addEventListener('click', () => onClick(el, segment));
    },
    [onClick, segment],
  );

  return (
    <span
      ref={ref}
      data-segment={segment[0].toFixed(3)}
      className={`cursor-pointer mr-1 break-words ${matched ? 'text-view-word' : ''}`}
    >
      {word}
    </span>
  );
}

/**
 * Render a single sentence (group of segments) as a paragraph.
 */
function SentenceParagraph({
  segments,
  onWordClick,
  isWordMatched,
}: {
  segments: [number, number, string][];
  onWordClick: (wordEl: HTMLElement, segment: [number, number, string]) => void;
  isWordMatched: (word: string) => boolean;
}) {
  return (
    <p className="text-sm text-zinc-300 leading-relaxed mb-2">
      {segments.map((seg, si) => {
        const words = seg[2].split(/(\s+)/);
        return words.map((w, wi) =>
          w.trim() ? (
            <WordSpan
              key={`${si}-${wi}`}
              word={w}
              segment={seg}
              onClick={onWordClick}
              matched={isWordMatched(w)}
            />
          ) : (
            <span key={`${si}-${wi}`}>{w}</span>
          ),
        );
      })}
    </p>
  );
}

/**
 * Text view — transcription rendered as paragraphs of sentences with red wavy
 * underlines on each word. Clicking a word opens a tooltip.
 */
export function TextView({
  segments,
  onAddEffect,
  onSeekTo,
  formatTime,
  isWordMatched,
  closestRef,
}: {
  segments: [number, number, string][];
  onAddEffect: (start: number) => void;
  onSeekTo: (time: number) => void;
  formatTime: (s: number) => string;
  isWordMatched: (word: string) => boolean;
  closestRef: React.RefObject<number | null>;
}) {
  const [tooltip, setTooltip] = useState<{
    segment: [number, number, string];
    x: number;
    y: number;
  } | null>(null);

  const sentenceGroups = useMemo(() => groupIntoSentences(segments), [segments]);

  // Close tooltip on click outside
  useEffect(() => {
    if (!tooltip) return;
    const handler = (e: MouseEvent) => {
      // Don't close if clicking inside the tooltip portal
      if ((e.target as HTMLElement).closest('[data-tooltip="word"]')) return;
      setTooltip(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tooltip]);

  // Escape key closes tooltip and cancels proposed time
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTooltip(null);
        playerActions.setProposedTime(null);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleWordClick = useCallback(
    (wordEl: HTMLElement, segment: [number, number, string]) => {
      if (tooltip?.segment === segment) {
        // Clicking the same word closes the tooltip
        setTooltip(null);
        return;
      }
      const rect = wordEl.getBoundingClientRect();
      // Clamp x to avoid going off-screen
      const clampedX = Math.min(rect.left, window.innerWidth - 220);
      setTooltip({ segment, x: clampedX, y: rect.bottom });
    },
    [tooltip],
  );

  const proposedTime = usePlayerStore((s) => s.proposedTime);

  const handleProposeStart = useCallback(() => {
    const segment = tooltip!.segment;
    const pt = usePlayerStore.getState().proposedTime;
    if (pt === segment[0]) {
      // Cancel: same value already proposed
      playerActions.setProposedTime(null);
    } else {
      playerActions.setProposedTime(segment[0]);
    }
  }, [tooltip]);

  const handleProposeEnd = useCallback(() => {
    const segment = tooltip!.segment;
    const pt = usePlayerStore.getState().proposedTime;
    if (pt === segment[1]) {
      // Cancel: same value already proposed
      playerActions.setProposedTime(null);
    } else {
      playerActions.setProposedTime(segment[1]);
    }
  }, [tooltip]);

  // Highlight current word — DOM-only, no React re-render
  useEffect(() => {
    const interval = setInterval(() => {
      const closest = closestRef.current;
      if (closest == null) return;
      // Remove old highlight
      const old = document.querySelector('[data-highlight="current"]');
      if (old) old.removeAttribute('data-highlight');
      // Add highlight to current word
      const el = document.querySelector(`[data-segment="${closest.toFixed(3)}"]`);
      if (el) el.setAttribute('data-highlight', 'current');
    }, 100);
    return () => clearInterval(interval);
  }, [closestRef]);

  return (
    <div className="pt-2">
      {sentenceGroups.map((group, gi) => (
        <SentenceParagraph key={gi} segments={group} onWordClick={handleWordClick} isWordMatched={isWordMatched} />
      ))}

      {tooltip && (
        <WordTooltip
          segment={tooltip.segment}
          x={tooltip.x}
          y={tooltip.y}
          onClose={() => setTooltip(null)}
          onAddEffect={onAddEffect}
          onSeekTo={onSeekTo}
          onProposeStart={handleProposeStart}
          onProposeEnd={handleProposeEnd}
          proposedTime={proposedTime}
          formatTime={formatTime}
        />
      )}
    </div>
  );
}
