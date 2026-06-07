import { memo, useRef, useCallback, useEffect, useState } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
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
    void seekToTime(time);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    // Update visual immediately on drag start
    handleClick(e);
  };

  const handleDragEnd = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    // Seek to the final position only once on drag end
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = duration * percent;
    void seekToTime(time);
  }, [duration]);

  // During drag: update visuals only — no seek, no iterator restart
  const handleDragVisual = useCallback((e: MouseEvent) => {
    if (!progressRef.current || !isDraggingRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = duration * percent;

    // Update store time for display
    playerActions.setCurrentTime(time);

    // Update progress bar DOM directly
    const cache = {
      currentTimeEl: document.querySelector('[data-testid="current-time"]') as HTMLElement | null,
      progressFill: document.querySelector('[data-testid="progress-fill"]') as HTMLElement | null,
      progressThumb: document.querySelector('[data-testid="progress-thumb"]') as HTMLElement | null,
    };
    if (cache.currentTimeEl) cache.currentTimeEl.textContent = formatSeconds(time);
    if (cache.progressFill) cache.progressFill.style.width = `${percent * 100}%`;
    if (cache.progressThumb) cache.progressThumb.style.left = `${percent * 100}%`;
  }, [duration, formatSeconds]);

  useEffect(() => {
    window.addEventListener('mousemove', handleDragVisual);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragVisual);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [handleDragVisual, handleDragEnd]);

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
