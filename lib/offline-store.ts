// lib/offline-store.ts
// IndexedDB-based offline queue for activity logs

const DB_NAME    = "acculog-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-logs";

export interface PendingLog {
  id: string;
  payload: Record<string, unknown>;
  createdAt: number;
  retries: number;
}

// ── DB helper ─────────────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Add a log payload to the offline queue. Returns the generated id. */
export async function enqueuePendingLog(
  payload: Record<string, unknown>
): Promise<string> {
  const db  = await openDB();
  const id  = `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const entry: PendingLog = { id, payload, createdAt: Date.now(), retries: 0 };

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.add(entry);

    req.onsuccess    = () => resolve(id);
    req.onerror      = () => reject(req.error);
    tx.oncomplete    = () => db.close();
  });
}

/** Return all queued logs sorted oldest-first. */
export async function getAllPendingLogs(): Promise<PendingLog[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.getAll();

    req.onsuccess = () => {
      resolve(
        (req.result as PendingLog[]).sort((a, b) => a.createdAt - b.createdAt)
      );
      db.close();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Remove a successfully-synced log. */
export async function removePendingLog(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(id);

    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

/** Bump the retry counter for a failed log. */
export async function incrementRetry(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx     = db.transaction(STORE_NAME, "readwrite");
    const store  = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);

    getReq.onsuccess = () => {
      const entry = getReq.result as PendingLog | undefined;
      if (!entry) { resolve(); return; }
      entry.retries += 1;
      store.put(entry);
      resolve();
    };

    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete  = () => db.close();
  });
}

/** Return the count of queued logs without loading them all. */
export async function getPendingCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req   = store.count();

    req.onsuccess = () => { resolve(req.result); db.close(); };
    req.onerror   = () => reject(req.error);
  });
}