import { memo } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

const VolumeControlsInner = () => {
  const volume = usePlayerStore((state) => state.volume);
  const isMuted = usePlayerStore((state) => state.isMuted);
  const { setVolume, toggleMute } = useMediaPlayerContext();

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const handleMuteToggle = () => {
    toggleMute();
  };

  const volumeIcon = isMuted ? '/assets/volume-off-icon.svg'
    : volume >= 0.67 ? '/assets/volume-2-icon.svg'
    : volume >= 0.34 ? '/assets/volume-1-icon.svg'
    : '/assets/volume-0-icon.svg';

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleMuteToggle}
        className="p-1 rounded-md hover:bg-zinc-700 transition-colors"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        <img src={volumeIcon} alt={isMuted ? 'Unmute' : 'Mute'} className="w-5 h-5" />
      </button>

      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={isMuted ? 0 : volume}
        onChange={handleVolumeChange}
        className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
        aria-label="Volume"
      />
    </div>
  );
};

export const VolumeControls = memo(VolumeControlsInner);
