import { backendPath, backendHeaders } from '../config';

/**
 * Get backend auth headers: credentials + Bearer token if available.
 * Mobile browsers block SameSite=None cross-site cookies, so the Bearer
 * fallback ensures requests reach the backend authenticated.
 */
function getAuthHeaders(): Record<string, string> {
  const headers = { ...backendHeaders() };
  const token = localStorage.getItem('obrez_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Upload a Blob via XMLHttpRequest with live upload-progress callbacks.
 * Returns the parsed JSON response body.
 *
 * @param onProgress  — called with { loaded, total, pct } during upload
 */
export function uploadFile(
  file: Blob,
  fileName: string,
  path: string,
  onProgress?: (info: { loaded: number; total: number; pct: number }) => void,
): Promise<any> {
  const url = backendPath(path);
  const extraHeaders = getAuthHeaders();

  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    for (const [key, value] of Object.entries(extraHeaders)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress({
          loaded: e.loaded,
          total: e.total,
          pct: Math.round((e.loaded / e.total) * 100),
        });
      }
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.detail || data.error || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed (HTTP ${xhr.status})`));
        }
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Invalid JSON response from server'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error while uploading'));
    xhr.onabort = () => reject(new Error('Upload aborted'));

    const formData = new FormData();
    formData.append('file', file, fileName);
    xhr.send(formData);
  });
}

/** Format bytes to a human-readable string (e.g. "12.3 MB"). */
export function fmtBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/** Safely format a percentage — never returns NaN or negative. */
export function safePct(pct: unknown): number {
  if (typeof pct !== 'number' || !isFinite(pct) || pct < 0) return 0;
  return Math.round(pct);
}
