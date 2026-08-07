import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '../../store/playerStore';
import { useMediaPlayerContext } from '../../context/MediaPlayerContext';

const MINI_H = 48; // px height of the mini player

/**
 * Mini player — a small video preview shown in the header when the main
 * PlayerDisplay scrolls out of the viewport.
 */
export function MiniPlayer() {
  const { canvasRef } = useMediaPlayerContext();
  const miniRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const visibleRef = useRef(true);

  const fileName = usePlayerStore((s) => s.fileName);

  // Observe when the main canvas is out of the viewport
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasVisible = visibleRef.current;
        visibleRef.current = entry.isIntersecting;
        // Main canvas just became invisible → start mini-player
        if (wasVisible && !entry.isIntersecting) {
          startMini();
        }
        // Main canvas just became visible again → stop mini-player
        if (!wasVisible && entry.isIntersecting) {
          stopMini();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(canvas);
    return () => observer.disconnect();

    function startMini() {
      visibleRef.current = false;
      runMiniRaf();
    }

    function stopMini() {
      visibleRef.current = true;
      cancelAnimationFrame(rafRef.current);
    }
  }, [canvasRef]);

  const runMiniRaf = useCallback(() => {
    if (visibleRef.current) return; // main canvas visible, stop
    if (!fileName) return; // no file, stop

    const mainCanvas = canvasRef.current;
    const miniCanvas = miniRef.current;
    if (!mainCanvas || !miniCanvas) {
      rafRef.current = requestAnimationFrame(runMiniRaf);
      return;
    }

    const dst = miniCanvas.getContext('2d');
    if (!dst) {
      rafRef.current = requestAnimationFrame(runMiniRaf);
      return;
    }

    // Resize to match main canvas resolution
    if (miniCanvas.width !== mainCanvas.width || miniCanvas.height !== mainCanvas.height) {
      miniCanvas.width = mainCanvas.width;
      miniCanvas.height = mainCanvas.height;
    }

    dst.drawImage(mainCanvas, 0, 0);

    rafRef.current = requestAnimationFrame(runMiniRaf);
  }, [fileName, canvasRef]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Only show when there's a file and the main canvas is scrolled out
  if (!fileName || visibleRef.current) {
    return null;
  }

  return (
    <canvas
      ref={miniRef}
      className="rounded-lg border border-zinc-700"
      style={{ height: MINI_H, objectFit: 'contain' }}
      aria-label="Mini player preview"
    />
  );
}
