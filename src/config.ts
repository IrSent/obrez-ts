let _backendUrl: string | null = null;

/**
 * Load backend URL from runtime config written by the backend on startup.
 * Falls back to local dev URL if config is unavailable.
 */
export async function loadBackendUrl(): Promise<string> {
  if (_backendUrl) return _backendUrl;

  try {
    const resp = await fetch('../backend-url.json');
    if (resp.ok) {
      const data = await resp.json();
      _backendUrl = data.url;
      return _backendUrl;
    }
  } catch {
    // fall through to default
  }

  _backendUrl = 'https://obrez-backend.loca.lt';
  return _backendUrl;
}

/** Must only be called after loadBackendUrl() — e.g. in async contexts. */
export function backendPath(path: string): string {
  if (!_backendUrl) throw new Error('Backend URL not loaded. Call loadBackendUrl() first.');
  return `${_backendUrl}${path}`;
}

/** Headers sent with every backend request. */
export function backendHeaders(): Record<string, string> {
  return { 'bypass-tunnel-reminder': 'true' };
}

/** Must only be called after loadBackendUrl() — e.g. in async contexts. */
export function backendWsPath(path: string): string {
  if (!_backendUrl) throw new Error('Backend URL not loaded. Call loadBackendUrl() first.');
  const scheme = _backendUrl.startsWith('https') ? 'wss://' : 'ws://';
  return `${scheme}${_backendUrl.split('://')[1]}${path}`;
}
