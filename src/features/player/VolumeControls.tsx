import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayer } from '../../hooks/useMediaPlayer';

export const VolumeControls = () => {
  const { volume, isMuted } = usePlayerStore();
  const { setVolume, toggleMute } = useMediaPlayer();

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const handleMuteToggle = () => {
    toggleMute();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleMuteToggle}
        className="p-1 rounded-md hover:bg-zinc-700 transition-colors"
        aria-label={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 0 0-3.887 19.45l6.113-6.113A1 1 0 0 1 16 16v-4a1 1 0 0 1 2 0v4a1 1 0 0 1-1.414 1l-6.113 6.113A10 10 0 0 0 12 2z" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a10 10 0 0 0-3.887 19.45l6.113-6.113A1 1 0 0 1 16 16v-4a1 1 0 0 1 2 0v4a1 1 0 0 1-1.414 1l-6.113 6.113A10 10 0 0 0 12 2zM9 12a1 1 0 0 1 2 0v4a1 1 0 0 1-2 0v-4z" />
          </svg>
        )}
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
