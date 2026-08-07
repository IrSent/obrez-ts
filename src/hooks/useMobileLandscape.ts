import { useState, useEffect } from 'react';

const MQ = window.matchMedia('(orientation: landscape) and (max-width: 850px)');

export function useIsLandscape(): boolean {
  const [matches, setMatches] = useState(MQ.matches);
  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    MQ.addEventListener('change', handler);
    return () => MQ.removeEventListener('change', handler);
  }, []);
  return matches;
}
