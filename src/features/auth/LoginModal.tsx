import { useCallback } from 'react';
import { generateCodeChallenge, generateCodeVerifier } from '../../utils/pkce-browser';

const TELEGRAM_CLIENT_ID = '8886675841';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
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

    window.location.href = authUrl.toString();
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

        <p className="text-sm text-zinc-400 mb-6">
          Transcription requires authentication. Sign in with Telegram to continue.
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
