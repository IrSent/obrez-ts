import { memo, useCallback } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { ProgressBar } from './ProgressBar';
import { VolumeControls } from './VolumeControls';

const PlayerDisplayInner = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const error = usePlayerStore((state) => state.error);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const isEnded = usePlayerStore((state) => state.isEnded);
  const { canvasRef, play, pause, togglePlay, seekToTime } = useMediaPlayerContext();

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // Ignore clicks that originate from controls
    if ((e.target as HTMLElement).closest('.player-controls')) return;
    void togglePlay();
  }, [togglePlay]);

  const handleReplay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    playerActions.setIsEnded(false);
    void seekToTime(0);
    void play();
  }, [seekToTime, play]);

  return (
    <div
      data-testid="player-display-container"
      className="relative w-full bg-zinc-900 rounded-lg overflow-hidden group"
    >
      <canvas
        id="videoCanvas"
        ref={canvasRef}
        aria-label="Video canvas"
        role="img"
        className="w-full bg-zinc-800 cursor-pointer"
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
              src="/assets/replay-icon.svg"
              alt="Replay"
              className="w-10 h-10"
            />
          </button>
        </div>
      )}

      {/* Controls overlay at the bottom */}
      <div className="player-controls absolute bottom-0 left-0 right-0 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
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
              src={isPlaying ? '/assets/pause-icon.svg' : '/assets/play-icon.svg'}
              alt={isPlaying ? 'Pause' : 'Play'}
              className="w-6 h-6"
            />
          </button>

          <ProgressBar />

          <VolumeControls />
        </div>
      </div>
    </div>
  );
};

export const PlayerDisplay = memo(PlayerDisplayInner);
