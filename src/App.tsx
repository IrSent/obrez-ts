import { useEffect, useState } from 'react';
import { MediaPlayerProvider } from './context/MediaPlayerContext';
import { PlayerDisplay } from './features/player/PlayerDisplay';
import { FileLoader } from './features/file-loader/FileLoader';
import { TranscriptionResults } from './features/transcription/TranscriptionResults';
import { ImportProgressModal } from './features/transcription/ImportProgressModal';
import { ExportButton } from './features/export/ExportModal';
import { APP_VERSION } from './version';
import { loadBackendUrl } from './config';
import { SettingsModal } from './features/settings/SettingsModal';
import { DebugButton } from './features/debug/DebugButton';

export const App = () => {
  // Load backend URL from runtime config on startup
  useEffect(() => {
    loadBackendUrl().then(url => console.log('Backend URL:', url));
  }, []);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <MediaPlayerProvider>
        <div className="min-h-screen bg-zinc-900 text-zinc-100">
          {/* Sticky header — full width */}
          <header className="sticky top-0 left-0 right-0 z-50 bg-zinc-900 border-b border-zinc-800">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src="assets/obrez-logo.jpg"
                  alt="Obrez Logo"
                  className="w-8 h-8"
                />
                <h1 className="text-3xl font-semibold text-purple-500 leading-8">Obrez <span className="text-xs font-normal text-zinc-500">{APP_VERSION}</span></h1>
              </div>
              <div className="flex items-center gap-1">
                <DebugButton />
                <button id="obrez-gear" onClick={() => setSettingsOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer text-sm">⚙️</button>
              </div>
            </div>
          </header>

          <div className="max-w-4xl mx-auto px-4 py-4">
            <ImportProgressModal />

            <div className="flex flex-col items-center gap-6">
                <FileLoader />
                <PlayerDisplay />
                <TranscriptionResults />
                <ExportButton />
            </div>
          </div>

          {/* Settings modal */}
          {settingsOpen && (
            <SettingsModal onClose={() => setSettingsOpen(false)} />
          )}
        </div>
      </MediaPlayerProvider>
  );
};
