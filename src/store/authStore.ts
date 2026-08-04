import { create } from 'zustand';
import type { AuthUser, HourPackType, PaymentInvoice, FiatCurrency } from '../types';
import { loadBackendUrl, backendHeaders } from '../config';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  // Active payment flow
  activeInvoice: PaymentInvoice | null;
  paymentStatus: 'idle' | 'polling' | 'paid' | 'failed';
}

interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  topup: (hourPackType: HourPackType, fiat?: FiatCurrency) => Promise<void>;
  pollPaymentStatus: (invoiceId: number) => Promise<void>;
  checkAuth: () => Promise<void>;
  exchangeCode: (code: string) => Promise<void>;
  clearError: () => void;
  clearActiveInvoice: () => void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set, get) => ({
  // State
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  activeInvoice: null,
  paymentStatus: 'idle',

  // Actions
  setUser: (user) => set({ user, isAuthenticated: !!user, error: null }),

  clearError: () => set({ error: null }),

  clearActiveInvoice: () => set({ activeInvoice: null, paymentStatus: 'idle' }),

  exchangeCode: async (code: string) => {
    try {
      await loadBackendUrl(); // ensure backend URL is loaded
      const codeVerifier = sessionStorage.getItem('obrez_pkce_verifier');
      const nonce = sessionStorage.getItem('obrez_pkce_nonce');
      const redirectUri = window.location.origin + window.location.pathname;

      if (!codeVerifier) {
        set({ error: 'PKCE verifier missing' });
        return;
      }
      if (!nonce) {
        set({ error: 'PKCE nonce missing' });
        return;
      }

      const url = await loadBackendUrl();
      const response = await fetch(`${url}/api/auth/telegram-oidc`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...backendHeaders() },
        body: JSON.stringify({
          code,
          code_verifier: codeVerifier,
          redirect_uri: redirectUri,
          nonce,
        }),
      });

      if (response.ok) {
        try {
          const data = await response.json();
          localStorage.setItem('obrez_user', JSON.stringify(data.user));
          // Store JWT for Bearer fallback on mobile (SameSite=None blocked)
          if (data.token) {
            localStorage.setItem('obrez_token', data.token);
          }
          set({ user: data.user, isAuthenticated: true, error: null });
        } catch {
          set({ error: 'Invalid response from server' });
        }
      } else {
        const err = await response.json().catch(() => ({
          detail: `Auth failed (HTTP ${response.status})`,
        }));
        set({ error: err.detail || `Auth failed (HTTP ${response.status})` });
      }
    } catch {
      set({ error: 'Network error during auth' });
    }
  },

  checkAuth: async () => {
    try {
      const url = await loadBackendUrl();
      const response = await fetch(`${url}/api/auth/me`, {
        credentials: 'include',
        headers: backendHeaders(),
      });
      if (response.ok) {
        try {
          const data = await response.json();
          localStorage.setItem('obrez_user', JSON.stringify(data.user));
          set({
            user: data.user,
            isAuthenticated: true,
            error: null,
          });
        } catch {
          set({ error: 'Invalid server response' });
        }
      } else if (response.status === 401 || response.status === 403) {
        // 401 can happen on mobile when SameSite=None cookie is blocked
        // by the browser (cross-site: GitHub Pages → localtunnel).
        // If we have a cached user in localStorage, keep them logged in
        // and let the backend validate the session on the next real request
        // (transcribe, topup). If there's no cached user, they're not logged in.
        const cached = localStorage.getItem('obrez_user');
        if (cached) {
          // Keep authenticated — cookie issue, not a real logout
          set({ error: null });
        } else {
          // No cached user — session expired or never logged in
          set({
            user: null,
            isAuthenticated: false,
            error: null,
          });
        }
      } else {
        // Other server error — keep user, show error
        const err = await response.json().catch(() => null);
        set({
          error: err?.detail || `Server error (HTTP ${response.status})`,
        });
      }
    } catch {
      // Network error — keep user, show error
      set({ error: 'Backend unavailable' });
    }
  },

  logout: async () => {
    localStorage.removeItem('obrez_user');
    localStorage.removeItem('obrez_token');
    try {
      const url = await loadBackendUrl();
      await fetch(`${url}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { ...backendHeaders(), 'Content-Type': 'application/json' },
      });
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false });
  },

  topup: async (hourPackType: HourPackType, fiat: FiatCurrency = 'USD') => {
    set({ isLoading: true, error: null });
    try {
      const url = await loadBackendUrl();
      const response = await fetch(
        `${url}/api/hours/topup?hour_pack_type=${hourPackType}&fiat=${fiat}`,
        { method: 'POST', credentials: 'include', headers: backendHeaders() },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Failed to top up');
      }
      const data = await response.json();

      if (data.invoice) {
        // Paid pack — we have a CryptoBot invoice to pay
        set({
          activeInvoice: data.invoice,
          paymentStatus: 'polling',
          isLoading: false,
        });
      } else {
        // Free pack — credited directly
        set({
          user: { ...(get().user || {}), ...data.user },
          isLoading: false,
        });
      }
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoading: false,
      });
    }
  },

  pollPaymentStatus: async (invoiceId: number) => {
    try {
      const url = await loadBackendUrl();
      const response = await fetch(
        `${url}/api/payments/status?invoice_id=${invoiceId}`,
        { credentials: 'include', headers: backendHeaders() },
      );
      if (!response.ok) return;

      const data = await response.json();
      if (data.status === 'credited') {
        set({
          user: { ...(get().user || {}), ...data.user },
          paymentStatus: 'paid',
          error: null,
        });
        // Don't clear activeInvoice here — let the PaymentModal's onPaid/close handle it
      }
    } catch {
      // ignore — keep polling
    }
  },
}));
