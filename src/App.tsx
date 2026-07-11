import { useEffect, useState } from 'react';
import { MediaPlayerProvider } from './context/MediaPlayerContext';
import { PlayerDisplay } from './features/player/PlayerDisplay';
import { FileLoader } from './features/file-loader/FileLoader';
import { TranscriptionResults } from './features/transcription/TranscriptionResults';
import { ImportProgressModal } from './features/transcription/ImportProgressModal';
import { ExportButton } from './features/export/ExportModal';
import { HeaderExportButton } from './features/export/HeaderExportButton';
import { loadBackendUrl, backendPath, backendHeaders } from './config';
import { SettingsModal } from './features/settings/SettingsModal';
import { DebugButton } from './features/debug/DebugButton';
import { usePlayerStore, playerActions } from './store/playerStore';
import { useAuthStore } from './store/authStore';
import { FastAhoScanner } from './aho-corasick';

const DEFAULT_DICTIONARIES = ['ru-profanity', 'ru-stopwords', 'ru-youtube'];

export const App = () => {
  // Load backend URL and default dictionaries on startup
  useEffect(() => {
    const loadDefaults = async () => {
      await loadBackendUrl();

      const store = usePlayerStore.getState();
      const loadedDictionaries = store.loadedDictionaries;

      for (const slug of DEFAULT_DICTIONARIES) {
        if (slug in loadedDictionaries) continue;
        try {
          const response = await fetch(backendPath(`/dictionary/${slug}`), {
            headers: backendHeaders(),
          });
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          const scanner = new FastAhoScanner(buffer);
          playerActions.loadDictionary(slug, slug, scanner);
        } catch (error) {
          console.error(`Failed to load default dictionary ${slug}:`, error);
        }
      }
    };
    loadDefaults();

    // Restore user from localStorage (survives page reload)
    const saved = localStorage.getItem('obrez_user');
    if (saved) {
      try {
        const user = JSON.parse(saved);
        useAuthStore.getState().setUser(user);
      } catch {
        localStorage.removeItem('obrez_user');
      }
    }
  }, []);

  // OIDC callback: handle Telegram auth code
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state) {
      const savedState = sessionStorage.getItem('obrez_pkce_state');
      if (savedState === state) {
        // Popup path: send code to opener and close
        if (window.opener) {
          window.opener.postMessage(`obrez_auth:${code}`, window.location.origin);
          window.close();
          return;
        }

        // Direct path (mobile fallback or page reload): exchange code locally
        const authStore = useAuthStore.getState();
        authStore.exchangeCode(code).then(() => {
          // Clear URL params and sessionStorage
          history.replaceState({}, '', window.location.pathname);
          sessionStorage.removeItem('obrez_pkce_verifier');
          sessionStorage.removeItem('obrez_pkce_state');
          sessionStorage.removeItem('obrez_pkce_nonce');
          // Now check auth — cookie should be set
          authStore.checkAuth();
        });
      } else {
        console.error('OIDC state mismatch — possible CSRF');
      }
    }
  }, []);

  // Settings modal
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <MediaPlayerProvider>
        <div className="min-h-screen bg-zinc-900 text-zinc-100">
          {/* Sticky header — full width */}
          <header className="sticky top-0 left-0 right-0 z-50 bg-zinc-900 border-b border-zinc-800">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <a href="https://irsent.github.io/obrez-ts" className="flex items-center gap-3">
                <img
                  src="assets/obrez-logo.jpg"
                  alt="Obrez Logo"
                  className="w-8 h-8"
                />
                <h1 className="text-3xl font-semibold text-purple-500 leading-8">Obrez</h1>
              </a>
              <div className="flex items-center gap-1">
                <HeaderExportButton />
                <DebugButton />
                <button id="obrez-gear" onClick={() => setSettingsOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer text-sm">⚙️</button>
              </div>
            </div>
          </header>

          <div className="max-w-4xl mx-auto px-4 py-4">
            <ImportProgressModal />

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
              <div className="space-y-6">
                <FileLoader />
                <PlayerDisplay />
                <TranscriptionResults />
              </div>
              <div className="hidden lg:flex lg:flex-col lg:gap-6">
                <ExportButton />
              </div>
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
