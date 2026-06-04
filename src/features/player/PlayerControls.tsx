import { memo } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';
import { ProgressBar } from './ProgressBar';
import { VolumeControls } from './VolumeControls';
import { FullscreenButton } from './FullscreenButton';

const PlayerControlsInner = () => {
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const { play, pause } = useMediaPlayerContext();

  const handlePlayPause = async () => {
    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-zinc-800 rounded-lg">
      <button
        onClick={handlePlayPause}
        className="p-2 rounded-md hover:bg-zinc-700 transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m12 3 10.5 6.5-10.5 6.5L12 21l8-5-8-5z" />
          </svg>
        )}
      </button>

      <ProgressBar />

      <VolumeControls />

      <FullscreenButton />
    </div>
  );
};

export const PlayerControls = memo(PlayerControlsInner);
