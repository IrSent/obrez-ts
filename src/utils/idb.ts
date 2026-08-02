/**
 * IndexedDB persistence for the OIDC redirect flow and transcription journal.
 *
 * The file blob and session metadata are saved to IndexedDB before redirecting
 * to Telegram. After the callback, we restore everything so the user picks up
 * where they left off. The file is deleted from IndexedDB right after restore.
 *
 * The journal store keeps a history of transcriptions associated with files,
 * so the user can reload past transcriptions for the same file.
 */

const DB_NAME = 'obrez-state';
const DB_VERSION = 2;
const STORE_NAME = 'session';
const JOURNAL_STORE = 'journal';

interface ErrorEntry {
  label: string;
  msg: string;
  source: string | null;
  frames: string[];
  raw: string;
  time: string;
}

interface StoredSession {
  fileName: string | null;
  fileBlob: Blob | null;
  transcriptionResults: Array<[number, number, string]> | null;
  censoringEffects: unknown[] | null;
  duration: number | null;
  authModal: 'login' | 'topup' | 'confirm' | null;
  wasTranscribing: boolean;
}

/** A single journal entry — one saved transcription for a file. */
export interface JournalEntry {
  id: string;
  fileName: string;
  fileSize: number;
  transcriptionResults: Array<[number, number, string]>;
  censoringEffects: unknown[];
  duration: number;
  method: 'import' | 'transcribe';
  savedAt: number; // epoch ms
  contentHash: string; // SHA-256 of transcriptionResults
}

function idbError(label: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  const error: ErrorEvent & { filename?: string; lineno?: number; colno?: number } =
    err instanceof ErrorEvent ? err : new Error(msg);
  (window as unknown as Record<string, ErrorEntry[]>).__obrezErrors.push({
    label,
    msg,
    source: error.filename ? `${error.filename}:${error.lineno}` : null,
    frames: error.stack?.split('\n').slice(1).map((f) => f.trim()) ?? [],
    raw: `${label}: ${msg}${error.stack ? '\n' + error.stack : ''}`,
    time: new Date().toLocaleTimeString(),
  });
}

function openDb(targetVersion?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, targetVersion ?? DB_VERSION);
    request.onerror = (e) => {
      idbError('IDB Open', (e.target as IDBOpenDBRequest)?.error ?? e);
      reject((e.target as IDBOpenDBRequest)?.error ?? e);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Session store (v1+)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }

      // Journal store (v2+)
      if (!db.objectStoreNames.contains(JOURNAL_STORE)) {
        const journal = db.createObjectStore(JOURNAL_STORE, { keyPath: 'id' });
        journal.createIndex('fileName', 'fileName', { unique: false });
        journal.createIndex('fileKey', ['fileName', 'fileSize'], { unique: false });
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

// ─── Session ────────────────────────────────────────────────

export async function saveSession(data: Partial<StoredSession>): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const existing = (await getFromStore(store, 'session')) as StoredSession | null;
    store.put({ ...existing, ...data }, 'session');
    await tx.complete;
  } catch (err) {
    idbError('IDB saveSession', err);
    throw err;
  }
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return getFromStore(store, 'session') as Promise<StoredSession | null>;
  } catch (err) {
    idbError('IDB loadSession', err);
    throw err;
  }
}

export async function clearSession(): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('session');
    await tx.complete;
  } catch (err) {
    idbError('IDB clearSession', err);
    throw err;
  }
}

// ─── Journal ────────────────────────────────────────────────

/** Generate a simple unique id for journal entries. */
function journalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalize transcription results for hashing — round floats to 6 decimals to avoid FP drift. */
function normalizeForHash(
  results: Array<[number, number, string]>,
): Array<[number, number, string]> {
  return results.map(([start, end, text]) => [Math.round(start * 1e6) / 1e6, Math.round(end * 1e6) / 1e6, text]);
}

/** Compute a SHA-256 content hash from transcription results. */
async function contentHash(transcriptionResults: Array<[number, number, string]>): Promise<string> {
  const data = JSON.stringify(normalizeForHash(transcriptionResults));
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Check if a journal entry with the same fileKey + contentHash already exists. */
async function hasDuplicate(fileName: string, fileSize: number, hash: string): Promise<boolean> {
  const entries = await loadAllJournalEntries();
  return entries.some((e) => e.fileName === fileName && e.fileSize === fileSize && e.contentHash === hash);
}

/** Save a transcription to the journal. Skips if identical content for the same file already exists. */
export async function saveJournalEntry(entry: Omit<JournalEntry, 'id' | 'savedAt' | 'contentHash'>): Promise<JournalEntry | null> {
  try {
    const hash = await contentHash(entry.transcriptionResults);

    // Dedup check
    const isDuplicate = await hasDuplicate(entry.fileName, entry.fileSize, hash);
    if (isDuplicate) {
      return null;
    }

    const full: JournalEntry = { ...entry, contentHash: hash, id: journalId(), savedAt: Date.now() };
    const db = await openDb();
    const tx = db.transaction(JOURNAL_STORE, 'readwrite');
    tx.objectStore(JOURNAL_STORE).add(full);
    await tx.complete;
    return full;
  } catch (err) {
    idbError('IDB saveJournalEntry', err);
    throw err;
  }
}

/** Load all journal entries for a given file (matched by fileName + fileSize). */
export async function loadJournalEntries(fileName: string, fileSize: number): Promise<JournalEntry[]> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, 'readonly');
  const store = tx.objectStore(JOURNAL_STORE);
  const index = store.index('fileKey');
  return new Promise((resolve, reject) => {
    const request = index.getAll([fileName, fileSize]);
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

/** Load all journal entries (for the Settings tab). */
export async function loadAllJournalEntries(): Promise<JournalEntry[]> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, 'readonly');
  const store = tx.objectStore(JOURNAL_STORE);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
  });
}

/** Delete a single journal entry by id. */
export async function deleteJournalEntry(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, 'readwrite');
  tx.objectStore(JOURNAL_STORE).delete(id);
  await tx.complete;
}

/** Delete all journal entries for a given file (matched by fileName + fileSize). */
export async function deleteJournalEntriesForFile(fileName: string, fileSize: number): Promise<void> {
  const entries = await loadJournalEntries(fileName, fileSize);
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, 'readwrite');
  const store = tx.objectStore(JOURNAL_STORE);
  for (const entry of entries) {
    store.delete(entry.id);
  }
  await tx.complete;
}

/** Delete all journal entries. */
export async function clearJournal(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, 'readwrite');
  tx.objectStore(JOURNAL_STORE).clear();
  await tx.complete;
}
