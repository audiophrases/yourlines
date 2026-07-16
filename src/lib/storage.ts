import type { Game, Site } from './types';

/**
 * Multi-profile local persistence, backed by IndexedDB.
 *
 * Layout (all keyed by `profileKey` = "site:username"):
 *   - `meta`     small ProfileSummary per account (fast to list; no games loaded)
 *   - `games`    the full Game[] per account
 *   - `settings` misc keys (currently just `lastActive`)
 *
 * The design is a deliberate "repository" so a cloud backend can later be added
 * as another adapter without touching the app: each record carries `updatedAt`
 * for last-write-wins sync, and export/import produces the same JSON a remote
 * store would exchange.
 */
const DB_NAME = 'yourlines';
const DB_VERSION = 2;
const META = 'meta';
const GAMES = 'games';
const SETTINGS = 'settings';
const LEGACY_KV = 'kv'; // v1 single-slot store, migrated on first v2 open
const LEGACY_LS_KEY = 'yourlines:v1'; // pre-IndexedDB localStorage cache

export interface ProfileSummary {
  key: string;
  site: Site;
  username: string;
  gameCount: number;
  savedAt: number;
  newestAt?: number;
  updatedAt: number;
}

export interface SavedProfile extends ProfileSummary {
  games: Game[];
}

export function profileKey(site: Site, username: string): string {
  return `${site}:${username.trim().toLowerCase()}`;
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

// ── IndexedDB plumbing ───────────────────────────────────────────────────
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (!db.objectStoreNames.contains(GAMES)) db.createObjectStore(GAMES);
      if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const r = op(tx.objectStore(store));
        r.onsuccess = () => resolve(r.result as T);
        r.onerror = () => reject(r.error);
      }),
  );
}

const metaGet = (key: string) => run<ProfileSummary | undefined>(META, 'readonly', (s) => s.get(key));
const metaAll = () => run<ProfileSummary[]>(META, 'readonly', (s) => s.getAll());
const metaPut = (key: string, v: ProfileSummary) => run(META, 'readwrite', (s) => s.put(v, key));
const metaDel = (key: string) => run(META, 'readwrite', (s) => s.delete(key));
const gamesGet = (key: string) => run<Game[] | undefined>(GAMES, 'readonly', (s) => s.get(key));
const gamesPut = (key: string, v: Game[]) => run(GAMES, 'readwrite', (s) => s.put(v, key));
const gamesDel = (key: string) => run(GAMES, 'readwrite', (s) => s.delete(key));
const settingsGet = <T>(key: string) => run<T | undefined>(SETTINGS, 'readonly', (s) => s.get(key));
const settingsPut = (key: string, v: unknown) => run(SETTINGS, 'readwrite', (s) => s.put(v, key));

// ── One-time migration from the v1 single-slot store / localStorage ───────
let migrated = false;
async function migrateOnce(): Promise<void> {
  if (migrated) return;
  migrated = true;
  try {
    const db = await openDb();
    // v1 IndexedDB single record under kv/current.
    if (db.objectStoreNames.contains(LEGACY_KV)) {
      const legacy = await run<{
        site: Site;
        username: string;
        games: Game[];
        savedAt: number;
        newestAt?: number;
      } | undefined>(LEGACY_KV, 'readonly', (s) => s.get('current')).catch(() => undefined);
      if (legacy?.games?.length) {
        await persist(legacy.site, legacy.username, legacy.games, legacy.savedAt, legacy.newestAt);
        await run(LEGACY_KV, 'readwrite', (s) => s.delete('current')).catch(() => {});
      }
    }
    // Pre-IndexedDB localStorage cache.
    const raw = localStorage.getItem(LEGACY_LS_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as {
        site: Site;
        username: string;
        games: Game[];
        savedAt: number;
        newestAt?: number;
      };
      if (legacy?.games?.length) {
        await persist(
          legacy.site,
          legacy.username,
          legacy.games,
          legacy.savedAt,
          legacy.newestAt ?? newestTimestamp(legacy.games),
        );
      }
      localStorage.removeItem(LEGACY_LS_KEY);
    }
  } catch {
    /* migration is best-effort */
  }
}

async function persist(
  site: Site,
  username: string,
  games: Game[],
  savedAt: number,
  newestAt?: number,
): Promise<ProfileSummary> {
  const key = profileKey(site, username);
  const summary: ProfileSummary = {
    key,
    site,
    username,
    gameCount: games.length,
    savedAt,
    newestAt,
    updatedAt: Date.now(),
  };
  await metaPut(key, summary);
  await gamesPut(key, games);
  return summary;
}

// ── Public API ────────────────────────────────────────────────────────────
export async function listProfiles(): Promise<ProfileSummary[]> {
  await migrateOnce();
  try {
    const all = await metaAll();
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function loadProfile(key: string): Promise<SavedProfile | null> {
  try {
    const meta = await metaGet(key);
    if (!meta) return null;
    const games = (await gamesGet(key)) ?? [];
    return { ...meta, games };
  } catch {
    return null;
  }
}

export async function getActiveKey(): Promise<string | null> {
  await migrateOnce();
  try {
    return (await settingsGet<string>('lastActive')) ?? null;
  } catch {
    return null;
  }
}

export async function setActiveKey(key: string): Promise<void> {
  try {
    await settingsPut('lastActive', key);
  } catch {
    /* ignore */
  }
}

/** Load the active profile, falling back to the most recently saved one. */
export async function loadActiveProfile(): Promise<SavedProfile | null> {
  await migrateOnce();
  const key = await getActiveKey();
  if (key) {
    const p = await loadProfile(key);
    if (p) return p;
  }
  const list = await listProfiles();
  if (!list.length) return null;
  await setActiveKey(list[0].key);
  return loadProfile(list[0].key);
}

export async function saveProfile(input: {
  site: Site;
  username: string;
  games: Game[];
  savedAt: number;
  newestAt?: number;
}): Promise<ProfileSummary> {
  const summary = await persist(input.site, input.username, input.games, input.savedAt, input.newestAt);
  await setActiveKey(summary.key);
  return summary;
}

export async function deleteProfile(key: string): Promise<void> {
  try {
    await metaDel(key);
    await gamesDel(key);
    const active = await getActiveKey();
    if (active === key) {
      const rest = await listProfiles();
      if (rest.length) await setActiveKey(rest[0].key);
      else await settingsPut('lastActive', undefined);
    }
  } catch {
    /* ignore */
  }
}

// ── Backup: export / import (the future cloud-sync payload) ────────────────
export interface Backup {
  app: 'yourlines';
  version: 1;
  exportedAt: number;
  profiles: SavedProfile[];
}

export async function exportBackup(): Promise<string> {
  const list = await listProfiles();
  const profiles: SavedProfile[] = [];
  for (const meta of list) {
    const full = await loadProfile(meta.key);
    if (full) profiles.push(full);
  }
  const backup: Backup = { app: 'yourlines', version: 1, exportedAt: Date.now(), profiles };
  return JSON.stringify(backup);
}

/** Import a backup, merging games per profile (dedupe by id). Returns count. */
export async function importBackup(json: string): Promise<number> {
  const data = JSON.parse(json) as Partial<Backup>;
  if (data.app !== 'yourlines' || !Array.isArray(data.profiles)) {
    throw new Error('Not a yourlines backup file.');
  }
  let count = 0;
  for (const p of data.profiles) {
    if (!p?.site || !p?.username || !Array.isArray(p.games)) continue;
    const existing = await loadProfile(profileKey(p.site, p.username));
    let games = p.games;
    if (existing) {
      const byId = new Map(existing.games.map((g) => [g.id, g]));
      for (const g of p.games) byId.set(g.id, g);
      games = [...byId.values()];
    }
    await persist(p.site, p.username, games, Math.max(p.savedAt ?? 0, Date.now()), newestTimestamp(games));
    count++;
  }
  return count;
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
