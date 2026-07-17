import { useCallback, useEffect, useRef, useState } from 'react';
import { generateCodeChallenge, generateCodeVerifier } from '../../utils/pkce-browser';

const TELEGRAM_CLIENT_ID = '8886675841';

interface LoginModalProps {
  onClose: () => void;
  onRetry?: () => void | Promise<void>;
  initialError?: string | null;
}

export function LoginModal({ onClose, onRetry, initialError }: LoginModalProps) {
  const signingRef = useRef<boolean>(false);
  const [btnDisabled, setBtnDisabled] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(initialError || null);

  const handleSignIn = useCallback(async () => {
    if (signingRef.current) return;
    signingRef.current = true;
    setBtnDisabled(true);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    const state = crypto.randomUUID();
    const nonce = crypto.randomUUID();

    sessionStorage.setItem('obrez_pkce_verifier', codeVerifier);
    sessionStorage.setItem('obrez_pkce_state', state);
    sessionStorage.setItem('obrez_pkce_nonce', nonce);

    const redirectUri = window.location.origin + window.location.pathname;

    const authUrl = new URL('https://oauth.telegram.org/auth');
    authUrl.searchParams.set('client_id', TELEGRAM_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('scope', 'openid profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('nonce', nonce);

    // Redirect to Telegram OIDC — no popup
    window.location.href = authUrl.toString();
  }, []);

  // Close modal on unmount
  useEffect(() => {
    return () => {
      signingRef.current = false;
      setBtnDisabled(false);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="relative bg-zinc-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-[0_25px_80px_rgba(0,0,0,0.7),0_14px_40px_rgba(0,0,0,0.5),0_5px_16px_rgba(0,0,0,0.35),0_0_0_1px_rgba(113,113,122,0.5)] max-h-[85vh] overflow-y-auto">
        <div className="pointer-events-none absolute inset-0 rounded-xl border border-transparent border-t-[rgba(255,255,255,0.06)] border-b-[rgba(0,0,0,0.25)]" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Sign in required</h2>
          {!btnDisabled && (
          <button
            onClick={() => {
              signingRef.current = false;
              setBtnDisabled(false);
              onClose();
            }}
            className="text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            ✕
          </button>
        )}
        </div>

        <p className="text-sm text-zinc-400 mb-2">
          Transcription requires authentication. Sign in with Telegram to continue.
        </p>
        <p className="text-xs text-zinc-500 mb-6">
          You get 5 free hours every 30 days — don't forget to claim them in the settings.
        </p>

        {retryError && (
          <div className="mb-4 p-3 bg-red-900/40 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{retryError}</p>
            {onRetry && (
              <button
                onClick={() => {
                  setRetryError(null);
                  onRetry();
                }}
                className="mt-2 w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={btnDisabled}
          className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
