/**
 * IndexedDB-backed storage for bleep sounds.
 *
 * Schema:
 *   DB name: obrez-bleep
 *   Store: sounds  (keyPath: id)
 *   Record: { id, label, source: 'file' | 'url', sourceUrl?: string, data?: ArrayBuffer }
 *
 *   - 'url' sounds store the remote URL in sourceUrl.
 *   - 'file' sounds store the raw audio bytes in data (no base64, no localStorage bloat).
 */

const DB_NAME = 'obrez-bleep';
const DB_VERSION = 1;
const STORE = 'sounds';

interface DbRecord {
  id: string;
  label: string;
  url?: string;
  data?: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (evt: any) => {
      const db = evt.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
  });
}

export async function getAllBleepRecords(): Promise<DbRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    db.close();
  });
}

export async function putBleepRecord(rec: DbRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(rec);
    tx.oncomplete = () => { resolve(); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
}

export async function deleteBleepRecord(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.delete(id);
    tx.oncomplete = () => { resolve(); db.close(); };
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
}

export async function updateBleepLabel(id: string, label: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result as DbRecord;
      if (rec) {
        rec.label = label;
        store.put(rec);
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
}

/**
 * Upsert: save audio blob data for an existing record.
 * If the record doesn't exist, creates it with the given id.
 */
export async function upsertBleepData(id: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      const rec = req.result as DbRecord | undefined;
      if (rec) {
        rec.data = data;
        store.put(rec);
      } else {
        store.add({ id, label: '', data });
      }
      resolve();
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { reject(tx.error); db.close(); };
  });
}
