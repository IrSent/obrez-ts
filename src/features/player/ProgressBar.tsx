import { useState, useRef, useCallback } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayer } from '../../hooks/useMediaPlayer';

export const ProgressBar = () => {
  const { currentTime, duration } = usePlayerStore();
  const { seekToTime, formatSeconds } = useMediaPlayer();
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = duration * percent;
    seekToTime(time);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleClick(e);
  };

  const handleDragEnd = () => setIsDragging(false);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!progressRef.current || !isDragging) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = duration * percent;
    seekToTime(time);
  }, [isDragging, duration, seekToTime]);

  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div className="flex-1 flex items-center gap-2">
      <span className="text-xs opacity-60">{formatSeconds(currentTime)}</span>

      <div
        ref={progressRef}
        onClick={handleClick}
        className="flex-1 h-1 bg-zinc-700 rounded-full cursor-pointer relative"
        role="progressbar"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-label="Playback progress"
      >
        <div
          data-testid="progress-fill"
          style={{ width: `${progress}%` }}
          className="h-full bg-purple-500 rounded-full"
        />
        <div
          onMouseDown={handleDragStart}
          data-testid="progress-thumb"
          style={{ left: `${progress}%` }}
          className="absolute w-4 h-4 bg-purple-500 rounded-full -top-1.5 -translate-x-1/2 cursor-grab active:cursor-grabbing"
        />
      </div>

      <span className="text-xs opacity-60">{formatSeconds(duration)}</span>
    </div>
  );
};
