import { create } from 'zustand';
import type { AuthUser, PackageType } from '../types';
import { loadBackendUrl } from '../config';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  topup: (packageType: PackageType) => Promise<void>;
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
      const redirectUri = window.location.origin + window.location.pathname;

      if (!codeVerifier) {
        set({ error: 'PKCE verifier missing' });
        return;
      }

      const url = await loadBackendUrl();
      const response = await fetch(`${url}/api/auth/telegram-oidc`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
      });

      if (response.ok) {
        const data = await response.json();
        set({ user: data.user, isAuthenticated: true, error: null });
      } else {
        const err = await response.json().catch(() => ({ detail: 'Auth failed' }));
        set({ error: err.detail || 'Auth failed' });
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
      });
      if (response.ok) {
        const data = await response.json();
        set({
          user: data.user,
          isAuthenticated: true,
          error: null,
        });
      } else {
        set({ user: null, isAuthenticated: false });
      }
    } catch {
      set({ user: null, isAuthenticated: false });
    }
  },

  logout: async () => {
    try {
      const url = await loadBackendUrl();
      await fetch(`${url}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false });
  },

  topup: async (packageType: PackageType) => {
    set({ isLoading: true, error: null });
    try {
      const url = await loadBackendUrl();
      const response = await fetch(
        `${url}/api/plan/topup?package_type=${packageType}`,
        { method: 'POST', credentials: 'include' },
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
