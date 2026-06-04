import { PlayerProvider } from './features/player/PlayerProvider';
import { MediaPlayerProvider } from './context/MediaPlayerContext';
import { PlayerDisplay } from './features/player/PlayerDisplay';
import { PlayerControls } from './features/player/PlayerControls';
import { FileLoader } from './features/file-loader/FileLoader';
import { DictionaryManager } from './features/dictionary/DictionaryManager';
import { TranscriptionResults } from './features/transcription/TranscriptionResults';

export const App = () => {
  return (
    <PlayerProvider>
      <MediaPlayerProvider>
        <div className="min-h-screen bg-zinc-900 text-zinc-100 p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <img
                src="/assets/obrez-logo.png"
                alt="Obrez Logo"
                className="w-8 h-8"
              />
              <h1 className="text-xl font-semibold text-purple-500">Obrez</h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <FileLoader />
                <div className="space-y-4">
                  <h2 className="text-sm font-semibold text-zinc-300">Player</h2>
                  <PlayerDisplay />
                  <h2 className="text-sm font-semibold text-zinc-300">Controls</h2>
                  <PlayerControls />
                </div>
                <TranscriptionResults />
              </div>

              <div className="lg:col-span-1">
                <DictionaryManager />
              </div>
            </div>
          </div>
        </div>
      </MediaPlayerProvider>
    </PlayerProvider>
  );
};
