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
        <img src={isPlaying ? '/assets/pause-icon.svg' : '/assets/play-icon.svg'} alt={isPlaying ? 'Pause' : 'Play'} className="w-6 h-6" />
      </button>

      <ProgressBar />

      <VolumeControls />

      <FullscreenButton />
    </div>
  );
};

export const PlayerControls = memo(PlayerControlsInner);
