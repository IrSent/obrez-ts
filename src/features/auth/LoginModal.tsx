import { useCallback, useEffect, useRef } from 'react';
import { generateCodeChallenge, generateCodeVerifier } from '../../utils/pkce-browser';
import { useAuthStore } from '../../store/authStore';

const TELEGRAM_CLIENT_ID = '8886675841';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const exchangeCode = useAuthStore((s) => s.exchangeCode);
  const authUrlRef = useRef<string>('');

  // Listen for auth code from popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Only accept from our own origin
      if (e.origin !== window.location.origin) return;
      if (typeof e.data !== 'string' || !e.data.startsWith('obrez_auth:')) return;

      const code = e.data.slice('obrez_auth:'.length);
      const savedState = sessionStorage.getItem('obrez_pkce_state');
      const popupState = sessionStorage.getItem('obrez_pkce_popup_state');

      // Verify state
      if (savedState === popupState) {
        // Clear popup state immediately to prevent fallback race condition
        sessionStorage.removeItem('obrez_pkce_popup_state');
        exchangeCode(code).then(() => {
          sessionStorage.removeItem('obrez_pkce_verifier');
          sessionStorage.removeItem('obrez_pkce_state');
          sessionStorage.removeItem('obrez_pkce_nonce');
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [exchangeCode]);

  const handleSignIn = useCallback(async () => {
    // PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // State + nonce
    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    // Store in sessionStorage for callback verification
    sessionStorage.setItem('obrez_pkce_verifier', codeVerifier);
    sessionStorage.setItem('obrez_pkce_state', state);
    sessionStorage.setItem('obrez_pkce_nonce', nonce);
    sessionStorage.setItem('obrez_pkce_popup_state', state);

    // Redirect URI = current page (no query params)
    const redirectUri = window.location.origin + window.location.pathname;

    // Build auth URL
    const authUrl = new URL('https://oauth.telegram.org/auth');
    authUrl.searchParams.set('client_id', TELEGRAM_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', 'openid profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    authUrlRef.current = authUrl.toString();

    // Open in popup — on desktop it's a small window, on mobile it replaces the current tab
    const popup = window.open(authUrl.toString(), '_blank', 'width=600,height=700');

    // If popup was blocked, fallback immediately
    if (!popup) {
      window.location.href = authUrl.toString();
      return;
    }

    // If popup closed immediately (blocked or mobile), fallback after short delay
    if (popup.closed) {
      window.location.href = authUrl.toString();
      return;
    }

    // Monitor popup — if it closes without sending code, fallback
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        // Check if code was already exchanged (state cleared)
        if (!sessionStorage.getItem('obrez_pkce_popup_state')) {
          // Code was handled via postMessage — good
          return;
        }
        // Popup closed without completing auth — fallback to direct navigation
        sessionStorage.removeItem('obrez_pkce_popup_state');
        window.location.href = authUrlRef.current;
      }
    }, 500);

    // Timeout — if popup is still open after 5s, give up and navigate directly
    setTimeout(() => {
      clearInterval(checkClosed);
    }, 30_000);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-zinc-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Sign in required</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-zinc-400 mb-2">
          Transcription requires authentication. Sign in with Telegram to continue.
        </p>
        <p className="text-xs text-zinc-500 mb-6">
          You get 5 free hours every 30 days — don't forget to claim them in the settings.
        </p>

        <button
          onClick={handleSignIn}
          className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.214-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.054 5.56-5.022c.242-.213-.054-.333-.373-.121l-6.861 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.83.945z"/>
          </svg>
          Sign in with Telegram
        </button>
      </div>
    </div>
  );
}
