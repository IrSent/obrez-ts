import { MediaPlayerProvider } from './context/MediaPlayerContext';
import { PlayerDisplay } from './features/player/PlayerDisplay';
import { FileLoader } from './features/file-loader/FileLoader';
import { DictionaryManager } from './features/dictionary/DictionaryManager';
import { BleepSoundManager } from './features/bleep-sounds/BleepSoundManager';
import { TranscriptionResults } from './features/transcription/TranscriptionResults';

export const App = () => {
  return (
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
                <PlayerDisplay />
                <TranscriptionResults />
              </div>

              <div className="lg:col-span-1 space-y-6">
                <DictionaryManager />
                <BleepSoundManager />
              </div>
            </div>
          </div>
        </div>
      </MediaPlayerProvider>
  );
};
