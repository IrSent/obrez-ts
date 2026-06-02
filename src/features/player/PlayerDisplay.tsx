import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayer } from '../../hooks/useMediaPlayer';

export const PlayerDisplay = () => {
  const fileName = usePlayerStore((state) => state.fileName);
  const error = usePlayerStore((state) => state.error);
  const { canvasRef } = useMediaPlayer();

  return (
    <div
      data-testid="player-display-container"
      className="relative w-full h-full bg-zinc-900 rounded-lg overflow-hidden"
    >
      <canvas
        id="videoCanvas"
        ref={canvasRef}
        aria-label="Video canvas"
        role="img"
        className="w-full h-full bg-zinc-800"
      />

      {!fileName && !error ? (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-zinc-500 text-center">Load video or audio file</p>
        </div>
      ) : null}

      {fileName ? (
        <div className="absolute bottom-0 left-0 right-0 p-2 pointer-events-none">
          <p className="text-zinc-400 text-sm truncate">{fileName}</p>
        </div>
      ) : null}
    </div>
  );
};
