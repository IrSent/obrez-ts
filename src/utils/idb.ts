/**
 * IndexedDB persistence for the OIDC redirect flow.
 *
 * The file blob and session metadata are saved to IndexedDB before redirecting
 * to Telegram. After the callback, we restore everything so the user picks up
 * where they left off. The file is deleted from IndexedDB right after restore.
 */

const DB_NAME = 'obrez-state';
const DB_VERSION = 1;
const STORE_NAME = 'session';

interface StoredSession {
  fileName: string | null;
  fileBlob: Blob | null;
  transcriptionResults: Array<[number, number, string]> | null;
  censoringEffects: unknown[] | null;
  duration: number | null;
  authModal: 'login' | 'topup' | 'confirm' | null;
  wasTranscribing: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getFromStore(store: IDBObjectStore, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(data: Partial<StoredSession>): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const existing = (await getFromStore(store, 'session')) as StoredSession | null;
  store.put({ ...existing, ...data }, 'session');
  await tx.complete;
}

export async function loadSession(): Promise<StoredSession | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  return getFromStore(store, 'session') as Promise<StoredSession | null>;
}

export async function clearSession(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.delete('session');
  await tx.complete;
}
