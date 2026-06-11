import type { BleepSound } from '../../types';

/**
 * Export all bleep sounds as a SQLite database file.
 */
export async function exportBleepSounds(sounds: Record<string, BleepSound>): Promise<void> {
  const initSqlJs = (await import('sql.js')).default;
  const sqlWasmUrl = (await import('sql.js/dist/sql-wasm.wasm')).default;
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });

  const db = new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS bleep_sounds (
      id       TEXT    PRIMARY KEY,
      label    TEXT    NOT NULL,
      url      TEXT    DEFAULT '',
      data     BLOB    DEFAULT NULL
    )
  `);

  const stmt = db.prepare('INSERT INTO bleep_sounds (id, label, url, data) VALUES (?, ?, ?, ?)');

  for (const sound of Object.values(sounds)) {
    if (sound.dataUrl) {
      // Extract raw bytes from base64 data URL
      const binary = atob(sound.dataUrl.split(',')[1] || sound.dataUrl);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      stmt.run([sound.id, sound.label, sound.url, bytes]);
    } else {
      stmt.run([sound.id, sound.label, sound.url, null]);
    }
  }

  stmt.free();

  const fileBytes = db.export();
  const blob = new Blob([fileBytes], { type: 'application/x-sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bleep-sounds-${Date.now()}.sqlite`;
  a.click();
  URL.revokeObjectURL(url);
  db.close();
}

/**
 * Import bleep sounds from a SQLite database file.
 */
export async function importBleepSounds(
  file: File,
  onAdd: (id: string, label: string, url: string, fileData?: ArrayBuffer) => void,
): Promise<number> {
  const initSqlJs = (await import('sql.js')).default;
  const sqlWasmUrl = (await import('sql.js/dist/sql-wasm.wasm')).default;
  const SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });

  const buffer = await file.arrayBuffer();
  const db = new SQL.Database(new Uint8Array(buffer));

  // Check that the table exists
  const tableCheck = db.exec(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='bleep_sounds'`,
  );
  if (!tableCheck.length || !tableCheck[0].values?.length) {
    db.close();
    throw new Error('File is not a valid bleep sounds SQLite export');
  }

  const rows = db.exec('SELECT id, label, url, data FROM bleep_sounds');
  let count = 0;

  if (rows.length && rows[0].values) {
    for (const row of rows[0].values) {
      const [id, label, url, data] = row as [string, string, string, ArrayBuffer | Uint8Array | string | null];

      if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
        // sql.js returns BLOB data as Uint8Array, not ArrayBuffer
        const arrayBuffer = data instanceof ArrayBuffer ? data : data.slice().buffer;
        onAdd(id, label, url, arrayBuffer);
      } else if (typeof data === 'string') {
        onAdd(id, label, data);
      } else if (url) {
        onAdd(id, label, url);
      }

      count++;
    }
  }

  db.close();
  return count;
}
