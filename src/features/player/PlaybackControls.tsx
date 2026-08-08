import { memo, useState } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { VolumeControls } from './VolumeControls';
import { cdBtn } from './cdBtn';
import type { PlaybackSpeed } from '../../types';

const SPEEDS: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

const MODAL_SHADOW = 'shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]';

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
  const currentTime = usePlayerStore((state) => state.currentTime);
  const { play, pause, seekToTime, getPlaybackTime } = useMediaPlayerContext();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Find previous/next segment by start time relative to current playback time
  const seekToWord = (direction: 'prev' | 'next') => {
    if (!transcriptionResults || transcriptionResults.length === 0) return;
    const t = getPlaybackTime();
    let idx = -1;
    if (direction === 'next') {
      // Find first segment with start > t
      for (let i = 0; i < transcriptionResults.length; i++) {
        if (transcriptionResults[i][0] > t) { idx = i; break; }
      }
      if (idx === -1) idx = transcriptionResults.length - 1; // last segment
    } else {
      // Find last segment with start <= t
      for (let i = transcriptionResults.length - 1; i >= 0; i--) {
        if (transcriptionResults[i][0] <= t) { idx = i; break; }
      }
      if (idx === -1) idx = 0; // first segment
    }
    seekToTime(transcriptionResults[idx][0]);
  };

  return (
    <div className={`relative bg-zinc-800 rounded-xl p-4 ${MODAL_SHADOW}`}>
      {/* 3D inner bevel highlight */}
      <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none" />

      {/* ── Carousel: horizontal snap-scroll ── */}
      <>
        <style>{`
          .playback-carousel::-webkit-scrollbar { display: none; }
        `}</style>
        <div
          className="playback-carousel overflow-x-auto snap-x snap-mandatory -mx-4 px-4"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <div className="snap-start flex-shrink-0">
            <button
              onClick={() => {
                if (isPlaying) void pause();
                else void play();
              }}
              className={`${cdBtn} h-10 px-2 rounded-md bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-600 flex-shrink-0 flex items-center justify-center`}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              <img
                src={isPlaying ? 'assets/pause-icon.svg' : 'assets/play-icon.svg'}
                alt={isPlaying ? 'Pause' : 'Play'}
                className="w-6 h-6"
              />
            </button>
          </div>

          {/* Previous word */}
          <div className="snap-start flex-shrink-0">
            <button
              onClick={() => seekToWord('prev')}
              disabled={!transcriptionResults}
              className={`${cdBtn} h-10 px-2 rounded-md bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-600 flex-shrink-0 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed`}
              title="Seek to previous word"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" style={{ stroke: 'currentColor', strokeWidth: 2 }} />
              </svg>
            </button>
          </div>

          {/* Next word */}
          <div className="snap-start flex-shrink-0">
            <button
              onClick={() => seekToWord('next')}
              disabled={!transcriptionResults}
              className={`${cdBtn} h-10 px-2 rounded-md bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-600 flex-shrink-0 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed`}
              title="Seek to next word"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" style={{ stroke: 'currentColor', strokeWidth: 2 }} />
              </svg>
            </button>
          </div>

          {/* Censoring mode toggle */}
          <div className="snap-start flex-shrink-0">
            <button
              onClick={() => playerActions.setCensoringMode(!censoringMode)}
              disabled={!(censoringEffects && censoringEffects.length > 0)}
              className={`${cdBtn} h-10 px-2 rounded text-[11px] font-semibold flex-shrink-0 flex items-center disabled:opacity-30 disabled:cursor-not-allowed ${
                censoringMode
                  ? 'bg-zinc-600 text-zinc-200 hover:bg-zinc-500 active:bg-zinc-700'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 active:bg-zinc-600'
              }`}
              title={censoringMode ? 'Censoring ON — click to play original audio' : 'Censoring OFF — click to play with effects'}
            >
              ⚡ Censored <LedIndicator on={censoringMode} />
            </button>
          </div>

          {/* Auto-scroll toggle */}
          <div className="snap-start flex-shrink-0">
            <button
              onClick={() => playerActions.toggleAutoScroll()}
              disabled={!(transcriptionResults && transcriptionResults.length > 0)}
              className={`${cdBtn} h-10 px-2 rounded text-[11px] font-semibold flex-shrink-0 flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed ${
                autoScroll
                  ? 'bg-zinc-600 text-zinc-200 hover:bg-zinc-500 active:bg-zinc-700'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 active:bg-zinc-600'
              }`}
              title={autoScroll ? 'Auto-scroll to current segment (ON)' : 'Auto-scroll to current segment (OFF)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="2" width="18" height="20" rx="3" />
                <line x1="12" y1="10" x2="12" y2="16" />
                <polyline points="9 13 12 16 15 13" />
              </svg>
              Autoscroll <LedIndicator on={autoScroll} />
            </button>
          </div>

          {/* Volume */}
          <div className="snap-start flex-shrink-0">
            <VolumeControls />
          </div>

          {/* Playback speed selector */}
          <div className="snap-start flex-shrink-0">
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu((v) => !v)}
                className={`${cdBtn} h-10 px-2 rounded text-[11px] font-semibold flex items-center gap-1 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 active:bg-zinc-600 ${
                  playbackSpeed !== 1 ? 'bg-zinc-600 text-zinc-200' : ''
                }`}
                title={`Playback speed: ${playbackSpeed}x`}
              >
                {playbackSpeed}x <ChevronDownIcon />
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-1 bg-zinc-800 border border-zinc-600 rounded-lg shadow-lg py-1 z-20">
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
