import { memo, useEffect, useRef, useState, createPortal } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { VolumeControls } from './VolumeControls';
import type { PlaybackSpeed } from '../../types';

const SPEEDS: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const MODAL_SHADOW = 'shadow-[0_30px_90px_rgba(0,0,0,0.8),0_18px_50px_rgba(0,0,0,0.6),0_8px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(113,113,122,0.5)]';

// ─── Thin divider between buttons (same as ActionButtons) ──────────────
const Divider = () => (
  <div className="w-px h-6 bg-zinc-600 flex-shrink-0" />
);

// ─── Button style — recessed into the surface like a CD-player slot ────
const PBtn = ({
  disabled,
  active,
  children,
  onClick,
  title,
  className = '',
}: {
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  className?: string;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center justify-center gap-1 rounded-b-lg px-3 py-2 flex-shrink-0 text-[11px] font-semibold
      shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),inset_0_1px_2px_rgba(0,0,0,0.25)]
      ${
      disabled
        ? 'bg-zinc-700/40 text-zinc-500 cursor-not-allowed'
        : active
          ? 'bg-zinc-600 text-zinc-200 hover:bg-zinc-500 active:bg-zinc-700'
          : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200 active:bg-zinc-600'
    } ${className}`}
    disabled={disabled}
    title={title}
  >
    {children}
  </button>
);

// ─── Wheel-to-scroll handler (vertical wheel → horizontal scroll) ─────
const useWheelScroll = () => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  return { ref };
};

/**
 * Icon: chevron down
 */
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/**
 * Tiny LED indicator — green glow when on, dim red when off.
 */
const LedIndicator = ({ on }: { on: boolean }) => (
  <span
    className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ml-1 ${
      on
        ? 'bg-green-400 shadow-[0_0_4px_1px_rgba(74,222,128,0.7)]'
        : 'bg-red-800 shadow-none'
    }`}
  />
);

const PlaybackControlsInner = () => {
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const censoringMode = usePlayerStore((state) => state.censoringMode);
  const censoringEffects = usePlayerStore((state) => state.censoringEffects);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const autoScroll = usePlayerStore((state) => state.autoScroll);
  const { play, pause, seekToTime, getPlaybackTime } = useMediaPlayerContext();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Find current segment, then navigate prev/next from there
  const seekToWord = (direction: 'prev' | 'next') => {
    if (!transcriptionResults || transcriptionResults.length === 0) return;
    const t = getPlaybackTime();

    // Find the segment we're currently in (or the first one after t)
    let currentIdx = -1;
    for (let i = 0; i < transcriptionResults.length; i++) {
      const [start, end] = transcriptionResults[i];
      if (t >= start && t < end) {
        currentIdx = i;
        break;
      }
    }
    if (currentIdx === -1) {
      // Not in any segment — find first segment starting after t
      for (let i = 0; i < transcriptionResults.length; i++) {
        if (transcriptionResults[i][0] > t) {
          currentIdx = i;
          break;
        }
      }
    }

    let targetIdx = direction === 'next'
      ? Math.min(transcriptionResults.length - 1, currentIdx + 1)
      : Math.max(0, currentIdx - 1);

    // If previous lands on the same segment (already at first), clamp
    if (direction === 'prev' && targetIdx === currentIdx) targetIdx = 0;

    seekToTime(transcriptionResults[targetIdx][0]);
  };

  const { ref: scrollRef } = useWheelScroll();

  return (
    <div className={`relative bg-zinc-800 rounded-2xl p-4 ${MODAL_SHADOW}`}>
      {/* 3D inner bevel — deeper for volume */}
      <div className="absolute inset-0 rounded-2xl border border-transparent border-t-[rgba(255,255,255,0.08)] border-b-[rgba(0,0,0,0.2)] pointer-events-none" />
      {/* Inner depth gradient */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[rgba(255,255,255,0.04)] to-transparent pointer-events-none" />

      {/* ── Carousel: recessed slot — horizontal scroll, wheel → horizontal ── */}
      <>
        <style>{`
          .playback-carousel::-webkit-scrollbar { display: none; }
        `}</style>
        <div
          className="playback-carousel overflow-x-auto rounded-xl bg-zinc-900/60 shadow-[inset_0_2px_5px_rgba(0,0,0,0.4)] -mx-2 -my-1 p-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
        <div
          ref={scrollRef}
          className="overflow-x-auto"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
        <div className="flex items-stretch gap-0">

          {/* Play/Pause */}
          <PBtn
            onClick={() => { if (isPlaying) void pause(); else void play(); }}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            <img
              src={isPlaying ? 'assets/pause-icon.svg' : 'assets/play-icon.svg'}
              alt={isPlaying ? 'Pause' : 'Play'}
              className="w-5 h-5"
            />
          </PBtn>

          <Divider />

          {/* Previous word */}
          <PBtn
            onClick={() => seekToWord('prev')}
            disabled={!transcriptionResults}
            title="Seek to previous word"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" style={{ stroke: 'currentColor', strokeWidth: 2 }} />
            </svg>
          </PBtn>

          <Divider />

          {/* Next word */}
          <PBtn
            onClick={() => seekToWord('next')}
            disabled={!transcriptionResults}
            title="Seek to next word"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" style={{ stroke: 'currentColor', strokeWidth: 2 }} />
            </svg>
          </PBtn>

          <Divider />

          {/* Censoring mode toggle */}
          <PBtn
            onClick={() => playerActions.setCensoringMode(!censoringMode)}
            disabled={!(censoringEffects && censoringEffects.length > 0)}
            title={censoringMode ? 'Censoring ON — click to play original audio' : 'Censoring OFF — click to play with effects'}
          >
            ⚡ Censored <LedIndicator on={censoringMode} />
          </PBtn>

          <Divider />

          {/* Auto-scroll toggle */}
          <PBtn
            onClick={() => playerActions.toggleAutoScroll()}
            disabled={!(transcriptionResults && transcriptionResults.length > 0)}
            title={autoScroll ? 'Auto-scroll to current segment (ON)' : 'Auto-scroll to current segment (OFF)'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="2" width="18" height="20" rx="3" />
              <line x1="12" y1="10" x2="12" y2="16" />
              <polyline points="9 13 12 16 15 13" />
            </svg>
            Autoscroll <LedIndicator on={autoScroll} />
          </PBtn>

          <Divider />

          {/* Volume */}
          <VolumeControls />

          <Divider />

          {/* Playback speed selector */}
          <div className="relative flex-shrink-0">
            <PBtn
              onClick={() => setShowSpeedMenu((v) => !v)}
              active={playbackSpeed !== 1}
              title={`Playback speed: ${playbackSpeed}x`}
            >
              {playbackSpeed}x
              <ChevronDownIcon />
            </PBtn>
            {/* Portal to escape overflow-x-auto carousel clipping */}
            {showSpeedMenu && createPortal(
              <div className="fixed bottom-10 right-4 z-50">
                <div className="bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg py-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        playerActions.setPlaybackSpeed(s);
                        setShowSpeedMenu(false);
                      }}
                      className={`block w-full text-left px-3 py-1 text-xs transition-colors ${
                        s === playbackSpeed
                          ? 'bg-purple-600 text-white'
                          : 'text-zinc-200 hover:bg-zinc-700'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>,
              document.body,
            )}

        </div>
        </div>
        </div>
        </div>
      </>
    </div>
  );
};

export const PlaybackControls = memo(PlaybackControlsInner);
