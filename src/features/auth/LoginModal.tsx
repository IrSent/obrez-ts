import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { loadBackendUrl } from '../../config';

const TELEGRAM_BOT_USERNAME = 'last_resort_obrez_bot';

interface LoginModalProps {
  onClose: () => void;
}

export function LoginModal({ onClose }: LoginModalProps) {
  const telegramRef = useRef<HTMLDivElement>(null);
  const setUser = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.setUser);
  const isAuthenticated = useAuthStore((s: ReturnType<typeof useAuthStore>) => s.isAuthenticated);
  const onLoggedInRef = useRef<(() => void) | null>(null);
  const [backendUrl, setBackendUrl] = useState<string | null>(null);

  // Load backend URL
  useEffect(() => {
    loadBackendUrl().then(setBackendUrl);
  }, []);

  // When authenticated, close the modal and trigger the callback
  useEffect(() => {
    if (isAuthenticated && onLoggedInRef.current) {
      onLoggedInRef.current();
    }
  }, [isAuthenticated]);

  // Inject Telegram widget only after we have the backend URL
  useEffect(() => {
    if (!backendUrl) return;

    const existing = document.querySelector(
      `script[data-telegram-login="${TELEGRAM_BOT_USERNAME}"]`,
    );
    if (existing) return;

    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-telegram-login', TELEGRAM_BOT_USERNAME);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '8');
    script.setAttribute('data-auth-url', `${backendUrl}/api/auth/telegram`);
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth');
    script.src = 'https://telegram.org/js/telegram-widget.js';

    (window as unknown as Record<string, unknown>).onTelegramAuth = (
      user: Record<string, unknown>,
    ) => {
      console.log('Telegram auth success:', user);
      setUser({
        id: Number(user.id),
        tg_user_id: Number(user.id),
        first_name: (user.first_name as string) || '',
        username: (user.username as string) || null,
        photo_url: (user.photo_url as string) || null,
        remaining_seconds: 0, // will be updated by checkAuth
        last_free_topup: null,
      });
    };

    if (telegramRef.current) {
      telegramRef.current.appendChild(script);
    }
  }, [backendUrl, setUser]);

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

        <div ref={telegramRef} className="flex justify-center mb-4" />
      </div>
    </div>
  );
}
