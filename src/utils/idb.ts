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
}

function openDb(targetVersion?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, targetVersion ?? DB_VERSION);
    request.onerror = () => reject(request.error);
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

// ─── Journal ────────────────────────────────────────────────

/** Generate a simple unique id for journal entries. */
function journalId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Save a transcription to the journal. */
export async function saveJournalEntry(entry: Omit<JournalEntry, 'id' | 'savedAt'>): Promise<JournalEntry> {
  const full: JournalEntry = { ...entry, id: journalId(), savedAt: Date.now() };
  const db = await openDb();
  const tx = db.transaction(JOURNAL_STORE, 'readwrite');
  tx.objectStore(JOURNAL_STORE).add(full);
  await tx.complete;
  return full;
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
