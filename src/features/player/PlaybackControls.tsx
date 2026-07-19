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
  const { play, pause } = useMediaPlayerContext();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  return (
    <div className={`relative bg-zinc-800 rounded-xl p-4 ${MODAL_SHADOW}`}>
      {/* 3D inner bevel highlight */}
      <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none" />

      <div className="flex items-center gap-3">
        {/* Play/Pause — CD-style button */}
        <button
          onClick={() => {
            if (isPlaying) void pause();
            else void play();
          }}
          className={`${cdBtn} p-2 rounded-md bg-zinc-700 hover:bg-zinc-600 active:bg-zinc-600 flex-shrink-0`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <img
            src={isPlaying ? 'assets/pause-icon.svg' : 'assets/play-icon.svg'}
            alt={isPlaying ? 'Pause' : 'Play'}
            className="w-6 h-6"
          />
        </button>

        {/* Censoring mode toggle — visible only when effects exist */}
        {censoringEffects && censoringEffects.length > 0 && (
          <button
            onClick={() => playerActions.setCensoringMode(!censoringMode)}
            className={`${cdBtn} px-2 py-1 rounded text-[11px] font-semibold flex-shrink-0 ${
              censoringMode
                ? 'bg-red-800 text-white hover:bg-red-700 active:bg-red-900 border-t-red-400 border-l-red-400 border-b-red-950 border-r-red-950 active:border-t-red-950 active:border-l-red-950 active:border-b-red-400 active:border-r-red-400'
                : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600 active:bg-zinc-600'
            }`}
            title={censoringMode ? 'Censoring ON — click to play original audio' : 'Censoring OFF — click to play with effects'}
          >
            {censoringMode ? '⚡ CENSORED' : '🔊 ORIGINAL'} <LedIndicator on={censoringMode} />
          </button>
        )}

        {/* Auto-scroll toggle — visible only when transcription results exist */}
        {transcriptionResults && transcriptionResults.length > 0 && (
          <button
            onClick={() => playerActions.toggleAutoScroll()}
            className={`${cdBtn} p-1 rounded flex-shrink-0 ${
              autoScroll
                ? 'text-purple-300 bg-purple-900/50 hover:bg-purple-800/50 active:bg-purple-950/50 border-t-purple-400 border-l-purple-400 border-b-purple-950 border-r-purple-950 active:border-t-purple-950 active:border-l-purple-950 active:border-b-purple-400 active:border-r-purple-400'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 active:bg-zinc-600'
            }`}
            title={autoScroll ? 'Auto-scroll to current segment (ON)' : 'Auto-scroll to current segment (OFF)'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="2" width="18" height="20" rx="3" />
              <line x1="12" y1="10" x2="12" y2="16" />
              <polyline points="9 13 12 16 15 13" />
            </svg>
            <LedIndicator on={autoScroll} />
          </button>
        )}

        <VolumeControls />

        {/* Playback speed selector — CD-style button */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setShowSpeedMenu((v) => !v)}
            className={`${cdBtn} px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 active:bg-zinc-600 ${
              playbackSpeed !== 1 ? 'bg-purple-900/50 text-purple-300 border-t-purple-500 border-l-purple-500 border-b-purple-950 border-r-purple-950' : ''
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
  );
};

export const PlaybackControls = memo(PlaybackControlsInner);
