import { useRef, useState, useEffect } from 'react';

export const FullscreenButton = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // FIX: убрал бесполезный DOM-запрос в селекторе — он не использовался

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleFullscreen = () => {
    if (!buttonRef.current) return;

    if (isFullscreen) {
      document.exitFullscreen();
    } else {
      const container = buttonRef.current.closest('[data-testid="player-container"]');
      container?.requestFullscreen();
    }
  };

  return (
    <button
      ref={buttonRef}
      onClick={handleFullscreen}
      className="p-1 rounded-md hover:bg-zinc-700 transition-colors"
      aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      <img
        src="/assets/fullscreen-icon.svg"
        alt={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        className="w-5 h-5"
      />
    </button>
  );
};
