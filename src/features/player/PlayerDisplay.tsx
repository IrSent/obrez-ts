import { memo, useCallback } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { ActionButtons } from '../action-buttons/ActionButtons';
import { ProgressBar } from './ProgressBar';

const PLAYER_SHADOW = 'shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]';

const PlayerDisplayInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const error = usePlayerStore((state) => state.error);
  const isEnded = usePlayerStore((state) => state.isEnded);
  const audioLocked = usePlayerStore((state) => state.audioLocked);
  const { canvasRef, play, seekToTime } = useMediaPlayerContext();

  const handleReplay = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    playerActions.setIsEnded(false);
    await seekToTime(0);
    await play();
  }, [seekToTime, play]);

  // Click on lock overlay: resume AudioContext, start playing, unlock
  const handleUnlock = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    playerActions.setAudioLocked(false);
    try {
      await play();
    } catch (err) {
      console.error('Failed to unlock playback:', err);
      playerActions.setAudioLocked(true);
    }
  }, [play]);

  return (
    <div
      data-testid="player-display-container"
      className={`relative w-full max-h-[33vh] bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center ${PLAYER_SHADOW}`}
    >
      {/* 3D inner bevel highlight */}
      <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none z-10" />

      <canvas
        id="videoCanvas"
        ref={canvasRef}
        aria-label="Video canvas"
        role="img"
        className="w-full max-h-[33vh] bg-zinc-800 [object-fit:contain]"
      />

      {!fileName && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-zinc-500 text-center">Load video or audio file</p>
        </div>
      )}

      {/* Replay overlay — shown when video ends */}
      {isEnded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20">
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

      {/* Audio locked overlay — shown after page reload when AudioContext is suspended */}
      {audioLocked && (
        <div data-testid="audio-lock-overlay" className="absolute inset-0 flex items-center justify-center bg-black/60 z-20 cursor-pointer" onClick={handleUnlock}>
          <div className="flex flex-col items-center gap-3">
            {/* Lock icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-14 h-14 text-yellow-400"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p className="text-zinc-300 text-sm font-medium">Click to unlock playback</p>
          </div>
        </div>
      )}

      {/* ActionButtons — overlay on the right side */}
      <div className="absolute right-3 top-3 z-30">
        <ActionButtons />
      </div>

      {/* Progress bar — overlay at the bottom of the player */}
      {fileName && (
        <div className="absolute bottom-3 left-4 right-4 z-30">
          <ProgressBar />
        </div>
      )}
    </div>
  );
};

export const PlayerDisplay = memo(PlayerDisplayInner);
