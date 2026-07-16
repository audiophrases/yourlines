import type { Game, Site } from './types';

/**
 * Local persistence for imported games. Uses IndexedDB (not localStorage) so
 * large histories — thousands of games — fit comfortably; localStorage caps at
 * ~5 MB, IndexedDB is typically hundreds of MB to GBs. The raw games are the
 * source of truth; the repertoire trees are rebuilt from them on load.
 */
const DB_NAME = 'yourlines';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'current';
const LEGACY_LS_KEY = 'yourlines:v1'; // pre-IndexedDB localStorage cache

export interface SavedSession {
  site: Site;
  username: string;
  games: Game[];
  savedAt: number;
  /** Newest game timestamp (ms) — the cursor for incremental refresh. */
  newestAt?: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const r = tx.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result as T | undefined);
        r.onerror = () => reject(r.error);
      }),
  );
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

function idbDel(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/** Newest game timestamp (ms) across a set of games, or undefined if none dated. */
export function newestTimestamp(games: Game[]): number | undefined {
  let max = 0;
  for (const g of games) {
    if (!g.date) continue;
    const t = Date.parse(g.date);
    if (t > max) max = t;
  }
  return max || undefined;
}

export async function loadSession(): Promise<SavedSession | null> {
  try {
    const found = await idbGet<SavedSession>(KEY);
    if (found?.games?.length) return found;
  } catch {
    /* fall through to legacy migration */
  }
  // One-time migration from the old localStorage cache.
  try {
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as SavedSession;
      if (legacy?.games?.length) {
        const migrated: SavedSession = {
          ...legacy,
          newestAt: legacy.newestAt ?? newestTimestamp(legacy.games),
        };
        await saveSession(migrated).catch(() => {});
        localStorage.removeItem(LEGACY_LS_KEY);
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function saveSession(session: SavedSession): Promise<boolean> {
  try {
    await idbSet(KEY, session);
    return true;
  } catch {
    return false;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await idbDel(KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(LEGACY_LS_KEY);
  } catch {
    /* ignore */
  }
}

/** Human-friendly "3h ago" style label. */
export function relativeTime(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
