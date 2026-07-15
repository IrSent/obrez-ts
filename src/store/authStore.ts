import { create } from 'zustand';
import type { AuthUser, HourPackType } from '../types';
import { loadBackendUrl, backendHeaders } from '../config';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  topup: (hourPackType: HourPackType) => Promise<void>;
  checkAuth: () => Promise<void>;
  exchangeCode: (code: string) => Promise<void>;
  clearError: () => void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set, get) => ({
  // State
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  // Actions
  setUser: (user) => set({ user, isAuthenticated: !!user, error: null }),

  clearError: () => set({ error: null }),

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
        // Session expired or not authenticated — clear, but don't set error
        // (401 is expected when user is not logged in)
        localStorage.removeItem('obrez_user');
        set({
          user: null,
          isAuthenticated: false,
          error: null,
        });
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

  topup: async (hourPackType: HourPackType) => {
    set({ isLoading: true, error: null });
    try {
      const url = await loadBackendUrl();
      const response = await fetch(
        `${url}/api/hours/topup?hour_pack_type=${hourPackType}`,
        { method: 'POST', credentials: 'include', headers: backendHeaders() },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
        throw new Error(err.detail || 'Failed to top up');
      }
      const data = await response.json();
      set({
        user: { ...(get().user || {}), ...data.user },
        isLoading: false,
      });
    } catch (err) {
      set({
        error: (err as Error).message,
        isLoading: false,
      });
    }
  },
}));
