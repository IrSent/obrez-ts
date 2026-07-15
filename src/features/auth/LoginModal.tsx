import { useCallback, useEffect, useRef, useState } from 'react';
import { generateCodeChallenge, generateCodeVerifier } from '../../utils/pkce-browser';
import { useAuthStore } from '../../store/authStore';
import { DebugButton } from '../debug/DebugButton';

const TELEGRAM_CLIENT_ID = '8886675841';
const REDIRECT_COUNTDOWN_SECONDS = 15;

interface LoginModalProps {
  onClose: () => void;
  onRetry?: () => void | Promise<void>;
  initialError?: string | null;
}

export function LoginModal({ onClose, onRetry, initialError }: LoginModalProps) {
  const exchangeCode = useAuthStore((s) => s.exchangeCode);
  const authUrlRef = useRef<string>('');
  const popupRef = useRef<Window | null>(null);
  const signingRef = useRef<boolean>(false);
  const [btnDisabled, setBtnDisabled] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(initialError || null);

  // Redirect countdown state
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Listen for auth code from popup
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (typeof e.data !== 'string' || !e.data.startsWith('obrez_auth:')) return;

      const code = e.data.slice('obrez_auth:'.length);
      const savedState = sessionStorage.getItem('obrez_pkce_state');
      const popupState = sessionStorage.getItem('obrez_pkce_popup_state');

      if (savedState === popupState) {
        sessionStorage.removeItem('obrez_pkce_popup_state');
        const popup = popupRef.current;
        if (popup && !popup.closed) {
          popup.close();
        }
        popupRef.current = null;
        // Cancel any pending redirect countdown
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setRedirectCountdown(null);
        exchangeCode(code)
          .then(() => {
            sessionStorage.removeItem('obrez_pkce_verifier');
            sessionStorage.removeItem('obrez_pkce_state');
            sessionStorage.removeItem('obrez_pkce_nonce');
          })
          .catch(() => {})
          .finally(() => {
            signingRef.current = false;
            setBtnDisabled(false);
          });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [exchangeCode]);

  const startRedirectCountdown = useCallback((countSeconds: number) => {
    setRedirectCountdown(countSeconds);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = setInterval(() => {
      setRedirectCountdown(prev => {
        if (prev === null || prev <= 0) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
          // Trigger redirect
          window.location.href = authUrlRef.current;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const cancelRedirect = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setRedirectCountdown(null);
  }, []);

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
    sessionStorage.setItem('obrez_pkce_popup_state', state);

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

    authUrlRef.current = authUrl.toString();

    const popup = window.open(authUrl.toString(), '_blank', 'width=600,height=700');
    popupRef.current = popup;

    // If popup was blocked, redirect immediately
    if (!popup) {
      window.location.href = authUrl.toString();
      return;
    }

    // If popup closed immediately (blocked or mobile), redirect immediately
    if (popup.closed) {
      window.location.href = authUrl.toString();
      return;
    }

    // Monitor popup — if it closes without sending code, start countdown
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        if (!sessionStorage.getItem('obrez_pkce_popup_state')) {
          // Code was handled via postMessage — good
          return;
        }
        // Popup closed without completing auth — start redirect countdown
        sessionStorage.removeItem('obrez_pkce_popup_state');
        popupRef.current = null;
        startRedirectCountdown(REDIRECT_COUNTDOWN_SECONDS);
      }
    }, 500);

    // Timeout — if popup is still open after 30s, start countdown
    setTimeout(() => {
      clearInterval(checkClosed);
      const stillOpen = popupRef.current && !popupRef.current.closed;
      if (stillOpen && sessionStorage.getItem('obrez_pkce_popup_state')) {
        popupRef.current?.close();
        popupRef.current = null;
        startRedirectCountdown(REDIRECT_COUNTDOWN_SECONDS);
      }
    }, 30_000);
  }, [startRedirectCountdown]);

  // Close popup and cancel countdown if modal is unmounted
  useEffect(() => {
    return () => {
      signingRef.current = false;
      setBtnDisabled(false);
      popupRef.current?.close();
      popupRef.current = null;
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-800 rounded-xl p-6 w-full max-w-sm mx-4 shadow-2xl border border-zinc-700 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-100">Sign in required</h2>
          <div className="flex items-center gap-2">
            <DebugButton />
            {!btnDisabled && (
            <button
              onClick={() => {
                signingRef.current = false;
                setBtnDisabled(false);
                cancelRedirect();
                onClose();
              }}
              className="text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              ✕
            </button>
          )}
          </div>
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

        {redirectCountdown !== null && (
          <div className="mb-4 p-3 bg-amber-900/40 border border-amber-700 rounded-lg">
            <p className="text-sm text-amber-300">
              Popup was closed. You will be redirected to Telegram to complete sign-in in {redirectCountdown} second{redirectCountdown !== 1 ? 's' : ''}.
            </p>
            <button
              onClick={cancelRedirect}
              className="mt-2 w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-200 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Stay on this page
            </button>
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
