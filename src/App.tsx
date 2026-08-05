import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MediaPlayerProvider } from './context/MediaPlayerContext';
import { useMediaPlayerContext } from './context/MediaPlayerContext';
import { PlayerDisplay } from './features/player/PlayerDisplay';
import { PlaybackControls } from './features/player/PlaybackControls';
import { TranscriptionResults } from './features/transcription/TranscriptionResults';
import { ImportProgressModal } from './features/transcription/ImportProgressModal';
import { loadBackendUrl, backendPath, backendHeaders } from './config';
import { SettingsContent } from './features/settings/SettingsContent';
import { usePlayerStore, playerActions } from './store/playerStore';
import { useAuthStore } from './store/authStore';
import { FastAhoScanner } from './aho-corasick';

const DEFAULT_DICTIONARIES = ['ru-profanity', 'ru-stopwords', 'ru-youtube'];

/** Restore session from IndexedDB — must be inside MediaPlayerProvider */
function SessionRestorer() {
  const { initMediaPlayer, startRenderLoop, play } = useMediaPlayerContext();
  const restoreRef = useRef(false);

  useEffect(() => {
    // Guard BEFORE any async — prevents React Strict Mode from running restore twice
    if (restoreRef.current) return;
    restoreRef.current = true;
    console.log('[SessionRestorer] restoring session (first call)');

    const restoreSession = async () => {
      try {
        const { loadSession } = await import('./utils/idb');
        const session = await loadSession();
        if (!session || !session.fileBlob || !session.fileName) return;

        const file = new File([session.fileBlob], session.fileName, {
          type: session.fileBlob.type || 'video/mp4',
        });

        await initMediaPlayer(file);

        if (session.transcriptionResults) {
          playerActions.setTranscriptionResults(session.transcriptionResults);
        }
        if (session.censoringEffects) {
          playerActions.setCensoringEffects(session.censoringEffects as any);
        }
        if (session.duration != null) {
          playerActions.setDuration(session.duration);
        }

        // No transcription in session — try the most recent journal entry for this file
        if (!session.transcriptionResults) {
          const { loadJournalEntries } = await import('./utils/idb');
          const fileSize = usePlayerStore.getState().fileSize;
          const entries = await loadJournalEntries(session.fileName, fileSize);
          if (entries.length > 0) {
            // Sort by savedAt descending → most recent first
            entries.sort((a, b) => b.savedAt - a.savedAt);
            const latest = entries[0];
            playerActions.setTranscriptionResults(latest.transcriptionResults);
            playerActions.setCensoringEffects(latest.censoringEffects as any);
            playerActions.setDuration(latest.duration);
          }
        }
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    };
    restoreSession();
  }, []);

  return null;
}

export const App = () => {
  // Load backend URL and default dictionaries on startup
  useEffect(() => {
    const loadDefaults = async () => {
      try {
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
      } catch {
        // Backend not available — skip dictionary loading silently
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

    // Restore volume from localStorage
    const savedVol = parseFloat(localStorage.getItem('obrez_volume') ?? '');
    if (!isNaN(savedVol)) {
      playerActions.setVolume(savedVol);
    }
  }, []);

  // OIDC callback: handle Telegram auth code after redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state) {
      const savedState = sessionStorage.getItem('obrez_pkce_state');
      if (savedState === state) {
        (async () => {
          const authStore = useAuthStore.getState();
          try {
            await authStore.exchangeCode(code);
          } finally {
            // ALWAYS clear URL params and sessionStorage — even if exchangeCode fails
            // (localtunnel 502/timeout on mobile). If ?code= remains, SettingsContent
            // sees it and closes immediately, making settings impossible to open.
            history.replaceState({}, '', window.location.pathname);
            sessionStorage.removeItem('obrez_pkce_verifier');
            sessionStorage.removeItem('obrez_pkce_state');
            sessionStorage.removeItem('obrez_pkce_nonce');
          }
          // Don't call checkAuth() — exchangeCode already set user and isAuthenticated.
          // An extra backend request risks localtunnel flakiness (502/timeout)
          // which would clear isAuthenticated = false and show "Sign in required".
        })();
      } else {
        console.error('OIDC state mismatch — possible CSRF');
        // Still clear the URL so Settings can open
        history.replaceState({}, '', window.location.pathname);
        sessionStorage.removeItem('obrez_pkce_verifier');
        sessionStorage.removeItem('obrez_pkce_state');
        sessionStorage.removeItem('obrez_pkce_nonce');
      }
    }
  }, []);

  // Settings open state
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <MediaPlayerProvider>
        <SessionRestorer />
        <div className="min-h-screen bg-zinc-900 text-zinc-100">
          {/* Main view — slides left when settings opens */}
          <div
            style={{
              width: '100%',
              height: '100vh',
              overflowY: 'auto',
              transform: settingsOpen ? 'translateX(100%)' : 'translateX(0)',
              transition: 'transform 500ms ease-in-out',
            }}
            className="bg-zinc-900"
          >
            <header id="obrez-header" className="sticky top-0 left-0 right-0 z-50 bg-zinc-900 border-b border-zinc-800">
              <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
                <a href="https://irsent.github.io/obrez-ts" className="flex items-center gap-3">
                  <img src="assets/obrez-logo.jpg" alt="Obrez Logo" className="w-8 h-8" />
                  <h1 className="text-3xl font-semibold text-purple-500 leading-8">Obrez</h1>
                </a>
                <div className="flex items-center gap-1">
                  <button id="obrez-gear" onClick={() => setSettingsOpen(true)} className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer text-sm">⚙️</button>
                </div>
              </div>
            </header>

            <div className="max-w-4xl mx-auto px-4 pb-20 space-y-4" style={{ paddingTop: '1.5rem' }}>
              <ImportProgressModal />
              <PlayerDisplay />
              <PlaybackControls />
              <TranscriptionResults />
            </div>
          </div>

          {/* Settings view — slides in from the right */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100vh',
              overflowY: 'auto',
              zIndex: 60,
              transform: settingsOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 500ms ease-in-out',
            }}
            className="bg-zinc-900"
          >
            <div className="max-w-4xl mx-auto px-4 py-4">
              <SettingsContent onClose={() => setSettingsOpen(false)} />
            </div>
          </div>
        </div>
      </MediaPlayerProvider>
  );
};
