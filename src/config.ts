let _backendUrl: string | null = null;

/**
 * Load backend URL from runtime config (backend-url.json).
 * Throws if the file is missing or unreadable — no fallback.
 */
export async function loadBackendUrl(): Promise<string> {
  if (_backendUrl) return _backendUrl;

  const resp = await fetch('../backend-url.json');
  if (!resp.ok) {
    throw new Error(`Failed to load backend URL (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  if (!data?.url) {
    throw new Error('backend-url.json is missing a valid "url" field');
  }
  _backendUrl = data.url;
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
