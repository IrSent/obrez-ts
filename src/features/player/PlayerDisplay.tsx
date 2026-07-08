import { memo, useCallback, useState, useEffect, useRef } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { ProgressBar } from './ProgressBar';
import { VolumeControls } from './VolumeControls';
import type { PlaybackSpeed } from '../../types';

const SPEEDS: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

/**
 * Icon: chevron down
 */
const ChevronDownIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const PlayerDisplayInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const error = usePlayerStore((state) => state.error);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isEnded = usePlayerStore((state) => state.isEnded);
  const censoringMode = usePlayerStore((state) => state.censoringMode);
  const censoringEffects = usePlayerStore((state) => state.censoringEffects);
  const playbackSpeed = usePlayerStore((state) => state.playbackSpeed);
  const transcriptionResults = usePlayerStore((state) => state.transcriptionResults);
  const autoScroll = usePlayerStore((state) => state.autoScroll);
  const { canvasRef, play, pause, togglePlay, seekToTime } = useMediaPlayerContext();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const showControls = controlsVisible || isHovered;

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Ignore clicks that originate from controls
    if ((e.target as HTMLElement).closest('.player-controls')) return;

    // Reset hide timer whenever controls are shown
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    // On mobile: first tap shows controls, second tap toggles play
    if (!controlsVisible) {
      setControlsVisible(true);
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
      return;
    }
    void togglePlay();
  }, [togglePlay, controlsVisible]);

  const handleReplay = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    playerActions.setIsEnded(false);
    await seekToTime(0);
    await play();
  }, [seekToTime, play]);

  return (
    <div
      data-testid="player-display-container"
      className="relative w-full max-h-[30rem] bg-zinc-900 rounded-lg overflow-hidden flex items-center justify-center"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <canvas
        id="videoCanvas"
        ref={canvasRef}
        aria-label="Video canvas"
        role="img"
        className="w-full max-h-[30rem] bg-zinc-800 cursor-pointer [object-fit:contain]"
        onClick={handleCanvasClick}
      />

      {!fileName && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-zinc-500 text-center">Load video or audio file</p>
        </div>
      )}

      {/* Replay overlay — shown when video ends */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <button
            onClick={handleReplay}
            className="p-4 rounded-full bg-zinc-800/90 hover:bg-zinc-700 transition-colors"
            aria-label="Replay from start"
          >
            <img
              src="assets/replay-icon.svg"
              alt="Replay"
              className="w-10 h-10"
            />
          </button>
        </div>
      )}

      {/* Controls overlay at the bottom */}
      <div className={`player-controls absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent transition-opacity ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (isPlaying) void pause();
              else void play();
            }}
            className="p-2 rounded-md hover:bg-zinc-700 transition-colors flex-shrink-0"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <img
              src={isPlaying ? 'assets/pause-icon.svg' : 'assets/play-icon.svg'}
              alt={isPlaying ? 'Pause' : 'Play'}
              className="w-6 h-6"
            />
          </button>

          <ProgressBar />

          {/* Censoring mode toggle — visible only when effects exist */}
          {censoringEffects && censoringEffects.length > 0 && (
            <button
              onClick={() => playerActions.setCensoringMode(!censoringMode)}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors flex-shrink-0 ${
                censoringMode
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
              }`}
              title={censoringMode ? 'Censoring ON — click to play original audio' : 'Censoring OFF — click to play with effects'}
            >
              {censoringMode ? '⚡ CENSORED' : '🔊 ORIGINAL'}
            </button>
          )}

          {/* Auto-scroll toggle — visible only when transcription results exist */}
          {transcriptionResults && transcriptionResults.length > 0 && (
            <button
              onClick={() => playerActions.toggleAutoScroll()}
              className={`p-1 rounded transition-colors flex-shrink-0 ${
                autoScroll
                  ? 'text-purple-400 bg-purple-900/30'
                  : 'text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
              }`}
              title={autoScroll ? 'Auto-scroll to current segment (ON)' : 'Auto-scroll to current segment (OFF)'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="2" width="18" height="20" rx="3" />
                <line x1="12" y1="10" x2="12" y2="16" />
                <polyline points="9 13 12 16 15 13" />
              </svg>
            </button>
          )}

          <VolumeControls />

          {/* Playback speed selector */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowSpeedMenu((v) => !v)}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors ${
                playbackSpeed === 1
                  ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  : 'bg-purple-900/50 text-purple-300 hover:bg-purple-800/50'
              }`}
              title={`Playback speed: ${playbackSpeed}x`}
            >
              {playbackSpeed}x
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
  );
};

export const PlayerDisplay = memo(PlayerDisplayInner);
