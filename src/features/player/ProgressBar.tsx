import { memo, useRef, useCallback, useEffect, useState } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

const ProgressBarInner = () => {
  const duration = usePlayerStore((state) => state.duration);
  const { seekToTime, formatSeconds, getPlaybackTime } = useMediaPlayerContext();
  const isDraggingRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);

  // Read currentTime directly from playback, not from store — avoids setState
  // in the hot path. Only update local state when the displayed seconds change.
  const [currentTime, setCurrentTime] = useState(0);
  const prevTimeRef = useRef(currentTime);

  useEffect(() => {
    const interval = setInterval(() => {
      const t = getPlaybackTime();
      // Only trigger re-render if the time actually changed (in whole seconds)
      if (Math.floor(t) !== Math.floor(prevTimeRef.current)) {
        prevTimeRef.current = t;
        setCurrentTime(t);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [getPlaybackTime]);

  const handleClick = (e: React.MouseEvent) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = duration * percent;
    seekToTime(time);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    handleClick(e);
  };

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!progressRef.current || !isDraggingRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = duration * percent;
    seekToTime(time);
  }, [duration, seekToTime]);

  useEffect(() => {
    window.addEventListener('mousemove', handleDrag);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDrag, handleDragEnd]);

  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div className="flex-1 flex items-center gap-2">
      <span className="text-xs opacity-60" data-testid="current-time">{formatSeconds(currentTime)}</span>

      <div
        ref={progressRef}
        onClick={handleClick}
        className="flex-1 py-1 flex items-center cursor-pointer relative"
        role="progressbar"
        aria-valuenow={currentTime}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-label="Playback progress"
      >
        <div className="flex-1 h-1 bg-zinc-700 rounded-full relative mx-2">
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
      </div>

      <span className="text-xs opacity-60" data-testid="duration" data-seconds={duration}>{formatSeconds(duration)}</span>
    </div>
  );
};

export const ProgressBar = memo(ProgressBarInner);
