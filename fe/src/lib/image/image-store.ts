// Receipt photo persistence — IndexedDB (native, no library needed: Blobs
// structured-clone directly, no base64 bloat like localStorage would need).
// One object store, keyed by a caller-generated id, indexed by save time so
// the retention sweep doesn't need to scan every record.

const DB_NAME = "expense-notes-images";
const STORE = "images";
export const MAX_AGE_DAYS = 45;

interface StoredImage {
  id: string;
  blob: Blob;
  savedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      store.createIndex("savedAt", "savedAt");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveImage(id: string, blob: Blob): Promise<void> {
  const record: StoredImage = { id, blob, savedAt: Date.now() };
  await withStore("readwrite", (store) => store.put(record));
}

export async function getImage(id: string): Promise<Blob | null> {
  const record = await withStore<StoredImage | undefined>("readonly", (store) => store.get(id));
  return record?.blob ?? null;
}

export async function deleteImage(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

/** Deletes every stored image last saved more than `maxAgeDays` ago. */
export async function purgeExpiredImages(maxAgeDays: number = MAX_AGE_DAYS): Promise<void> {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const index = tx.objectStore(STORE).index("savedAt");
      const req = index.openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve();
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
