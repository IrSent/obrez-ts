import { memo, useRef, useCallback, useEffect, useState } from 'react';
import { usePlayerStore, playerActions } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

const ProgressBarInner = () => {
  const duration = usePlayerStore((state) => state.duration);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const { seekToTime, formatSeconds, getPlaybackTime, pause } = useMediaPlayerContext();
  const isDraggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
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

  /**
   * Compute seek time from a pointer X coordinate (mouse or touch).
   */
  const seekFromX = useCallback((clientX: number) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = duration * percent;
    void seekToTime(time);
  }, [duration, seekToTime]);

  /**
   * Update visuals during drag (no seek — seek happens on release).
   */
  const updateDragVisual = useCallback((clientX: number) => {
    if (!progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const time = duration * percent;

    playerActions.setCurrentTime(time);

    const cache = {
      currentTimeEl: document.querySelector('[data-testid="current-time"]') as HTMLElement | null,
      progressFill: document.querySelector('[data-testid="progress-fill"]') as HTMLElement | null,
      progressThumb: document.querySelector('[data-testid="progress-thumb"]') as HTMLElement | null,
    };
    if (cache.currentTimeEl) cache.currentTimeEl.textContent = formatSeconds(time);
    if (cache.progressFill) cache.progressFill.style.width = `${percent * 100}%`;
    if (cache.progressThumb) cache.progressThumb.style.left = `${percent * 100}%`;
  }, [duration, formatSeconds]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    wasPlayingRef.current = isPlaying;
    if (isPlaying) void pause();
    isDraggingRef.current = true;
    updateDragVisual(e.clientX);
  };

  const handleDragEnd = useCallback((clientX: number) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    seekFromX(clientX);
  }, [seekFromX]);

  const handleDragVisualMouse = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    updateDragVisual(e.clientX);
  }, [updateDragVisual]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    handleDragEnd(e.clientX);
  }, [handleDragEnd]);

  // Touch handlers for iOS Safari
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    wasPlayingRef.current = isPlaying;
    if (isPlaying) void pause();
    isDraggingRef.current = true;
    updateDragVisual(touch.clientX);
  }, [isPlaying, pause, updateDragVisual]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDraggingRef.current) return;
    // Prevent page scroll on iOS while dragging the progress bar
    e.preventDefault();
    const touch = e.touches[0];
    updateDragVisual(touch.clientX);
  }, [updateDragVisual]);

  const handleTouchEnd = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    // seekFromX is called on the last known position via handleDragEnd
    // But for touch we don't have clientX on end — the visual time is already
    // in the store from updateDragVisual. Just seek to that time.
    const time = usePlayerStore.getState().currentTime;
    void seekToTime(time);
  }, [seekToTime]);

  useEffect(() => {
    window.addEventListener('mousemove', handleDragVisualMouse);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragVisualMouse);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleDragVisualMouse, handleMouseUp, handleTouchMove, handleTouchEnd]);

  const progress = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div className="flex-1 flex items-center gap-2">
      <span className="text-xs opacity-60" data-testid="current-time">{formatSeconds(currentTime)}</span>

      <div
        ref={progressRef}
        onMouseDown={handleDragStart}
        onTouchStart={handleTouchStart}
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
