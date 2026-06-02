import { usePlayerStore } from '../../store/playerStore';

/**
 * Провайдер для плеера.
 * Оборачивает компоненты, чтобы предоставить доступ к хуку useMediaPlayer.
 */
export const PlayerProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};
