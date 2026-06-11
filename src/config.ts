const BACKEND_URL = 'https://192.168.3.250:8686';

export { BACKEND_URL };

export function backendPath(path: string): string {
  return `${BACKEND_URL}${path}`;
}

export function backendWsPath(path: string): string {
  const scheme = BACKEND_URL.startsWith('https') ? 'wss://' : 'ws://';
  return `${scheme}${BACKEND_URL.split('://')[1]}${path}`;
}
