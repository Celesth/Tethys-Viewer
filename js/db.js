// ── FOLDER PERSISTENCE (IndexedDB) ────────────────────────────
// Stores parsed file contents (plain objects) — works on file:// with no permissions needed.
const DB_NAME  = 'tethys';
const DB_STORE = 'folders';
const THUMB_STORE = 'thumbs';  // base64 image cache
let   _db      = null;

async function openDB() {
  if (_db) return _db;
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 3);  // v3 adds thumbs store
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE))
        db.createObjectStore(DB_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(THUMB_STORE))
        db.createObjectStore(THUMB_STORE, { keyPath: 'url' });
    };
    req.onsuccess = e => { _db = e.target.result; res(_db); };
    req.onerror   = () => rej(req.error);
  });
}

async function dbSaveFolder(key, name, files) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put({ key, name, files });
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

async function dbGetAllFolders() {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx  = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => res(req.result ?? []);
    req.onerror   = () => rej(req.error);
  });
}

async function dbRemoveFolder(key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}
