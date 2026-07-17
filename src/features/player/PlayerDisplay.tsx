import { memo, useCallback } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

const PLAYER_SHADOW = 'shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)]';

const PlayerDisplayInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const error = usePlayerStore((state) => state.error);
  const isEnded = usePlayerStore((state) => state.isEnded);
  const { canvasRef, play, seekToTime } = useMediaPlayerContext();

  const handleReplay = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    playerActions.setIsEnded(false);
    await seekToTime(0);
    await play();
  }, [seekToTime, play]);

  return (
    <div
      data-testid="player-display-container"
      className={`relative w-full max-h-[30rem] bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center ${PLAYER_SHADOW}`}
    >
      {/* 3D inner bevel highlight */}
      <div className="absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)] pointer-events-none z-10" />

      <canvas
        id="videoCanvas"
        ref={canvasRef}
        aria-label="Video canvas"
        role="img"
        className="w-full max-h-[30rem] bg-zinc-800 [object-fit:contain]"
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
    </div>
  );
};

export const PlayerDisplay = memo(PlayerDisplayInner);
