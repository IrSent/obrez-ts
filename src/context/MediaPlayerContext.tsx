import { createContext, useContext, ReactNode } from 'react';
import { useMediaPlayer } from '../hooks/useMediaPlayer';

const MediaPlayerContext = createContext<ReturnType<typeof useMediaPlayer> | null>(null);

export const MediaPlayerProvider = ({ children }: { children: ReactNode }) => {
  const mediaPlayer = useMediaPlayer();
  return (
    <MediaPlayerContext.Provider value={mediaPlayer}>
      {children}
    </MediaPlayerContext.Provider>
  );
};

export const useMediaPlayerContext = () => {
  const context = useContext(MediaPlayerContext);
  if (!context) {
    throw new Error('useMediaPlayerContext must be used within MediaPlayerProvider');
  }
  return context;
};
