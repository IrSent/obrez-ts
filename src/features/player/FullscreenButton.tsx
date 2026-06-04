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
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 3H5v18h14V5h-3V3H8zm11 16H7V8h11v11z" />
      </svg>
    </button>
  );
};
