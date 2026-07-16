import { create } from 'zustand';
import { Chess } from 'chess.js';
import { importGames, ImportError } from '../lib/chessApi';
import { loadSession, saveSession, clearSession, newestTimestamp } from '../lib/storage';
import { logInfo, logError } from '../lib/debug';
import {
  buildTree,
  summarizeOpenings,
  findWeaknesses,
  type OpeningStat,
} from '../lib/tree';
import type { Color, Game, Site, TreeNode, Weakness } from '../lib/types';

export interface Repertoire {
  tree: TreeNode;
  openings: OpeningStat[];
  weaknesses: Weakness[];
  games: number;
}

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface State {
  site: Site;
  username: string;
  status: Status;
  error?: string;
  progress: number;

  games: Game[];
  repertoires: Record<Color, Repertoire> | null;
  color: Color;

  /** When the currently-loaded games were imported (ms epoch), if persisted. */
  savedAt?: number;
  /** Newest game timestamp across the loaded games — cursor for incremental refresh. */
  newestAt?: number;
  /** Games added by the most recent refresh (for a brief "+N new" note). */
  lastAdded?: number;
  /** Whether we've attempted to restore from storage this session. */
  hydrated: boolean;
  /** True until the initial restore-from-storage attempt completes. */
  hydrating: boolean;

  /** Current line from the start position (SAN moves). */
  path: string[];
  /** FEN for the current position (kept in sync with path). */
  fen: string;

  /** Whether the Stockfish eval bar / analysis is switched on. */
  engineOn: boolean;
  setEngineOn: (b: boolean) => void;

  setSite: (s: Site) => void;
  setUsername: (u: string) => void;
  /** Full import of all games for the current site/username. */
  runImport: () => Promise<void>;
  /** Incremental update: fetch only games newer than the cursor and merge. */
  refresh: () => Promise<void>;
  /** Restore a previous import from storage (idempotent). */
  hydrate: () => Promise<void>;
  /** Forget the persisted import and reset to the landing screen. */
  clearSaved: () => Promise<void>;
  setColor: (c: Color) => void;

  navTo: (path: string[]) => void;
  push: (san: string) => boolean;
  pop: () => void;
  toStart: () => void;

  current: () => TreeNode | null;
  repertoire: () => Repertoire | null;
}

const START_FEN = new Chess().fen();

function fenForPath(path: string[]): string {
  const c = new Chess();
  for (const m of path) {
    try {
      if (!c.move(m)) break;
    } catch {
      break;
    }
  }
  return c.fen();
}

function nodeAtPath(root: TreeNode | undefined, path: string[]): TreeNode | null {
  let n = root;
  if (!n) return null;
  for (const m of path) {
    n = n.children[m];
    if (!n) return null;
  }
  return n;
}

function buildRepertoire(games: Game[], color: Color): Repertoire {
  const tree = buildTree(games, color);
  return {
    tree,
    openings: summarizeOpenings(games, color),
    weaknesses: findWeaknesses(tree, color),
    games: tree.games,
  };
}

/** Build both repertoires and pick the more-played color as the default view. */
function buildAll(games: Game[]): {
  repertoires: Record<Color, Repertoire>;
  color: Color;
} {
  const repertoires: Record<Color, Repertoire> = {
    white: buildRepertoire(games, 'white'),
    black: buildRepertoire(games, 'black'),
  };
  const color: Color = repertoires.white.games >= repertoires.black.games ? 'white' : 'black';
  return { repertoires, color };
}

export const useStore = create<State>((set, get) => ({
  site: 'chesscom',
  username: '',
  status: 'idle',
  progress: 0,

  games: [],
  repertoires: null,
  color: 'white',
  savedAt: undefined,
  newestAt: undefined,
  lastAdded: undefined,
  hydrated: false,
  hydrating: true,

  path: [],
  fen: START_FEN,

  engineOn: false,
  setEngineOn: (engineOn) => set({ engineOn }),

  setSite: (site) => set({ site }),
  setUsername: (username) => set({ username }),

  runImport: async () => {
    const { site, username } = get();
    logInfo('import', `Full import started: ${site}/${username}`);
    set({ status: 'loading', error: undefined, progress: 0, lastAdded: undefined });
    try {
      const games = await importGames(site, username, {
        max: 'all',
        onProgress: (n) => set({ progress: n }),
      });
      if (!games.length) {
        logError('import', `No standard games for ${site}/${username}`);
        set({ status: 'error', error: 'No standard games found for that account.' });
        return;
      }
      const { repertoires, color } = buildAll(games);
      const savedAt = Date.now();
      const newestAt = newestTimestamp(games);
      // Persist the raw games so a reload restores instantly without re-fetching.
      const stored = await saveSession({ site, username, games, savedAt, newestAt });
      if (!stored) logError('storage', 'Failed to persist games (storage unavailable)');
      logInfo(
        'import',
        `Imported ${games.length} games (W:${repertoires.white.games} B:${repertoires.black.games}) from ${site}/${username}`,
      );
      set({
        games,
        repertoires,
        color,
        status: 'ready',
        path: [],
        fen: START_FEN,
        savedAt,
        newestAt,
        hydrated: true,
        hydrating: false,
      });
    } catch (e) {
      const msg =
        e instanceof ImportError
          ? e.message
          : 'Something went wrong importing games. Check the username and try again.';
      logError('import', `Import failed: ${msg}`, e);
      set({ status: 'error', error: msg });
    }
  },

  refresh: async () => {
    const { site, username, games: existing, newestAt, color } = get();
    if (!username || !existing.length) {
      // Nothing cached yet — treat as a full import.
      return get().runImport();
    }
    logInfo('refresh', `Refresh started: ${site}/${username} (since ${newestAt ?? 0})`);
    set({ status: 'loading', error: undefined, progress: 0, lastAdded: undefined });
    try {
      const fresh = await importGames(site, username, {
        max: 'all',
        since: newestAt,
        onProgress: (n) => set({ progress: n }),
      });
      const byId = new Map(existing.map((g) => [g.id, g]));
      let added = 0;
      for (const g of fresh) {
        if (!byId.has(g.id)) {
          byId.set(g.id, g);
          added++;
        }
      }
      const merged = added ? [...byId.values()] : existing;
      const { repertoires } = buildAll(merged);
      const savedAt = Date.now();
      const newest = newestTimestamp(merged);
      await saveSession({ site, username, games: merged, savedAt, newestAt: newest });
      logInfo('refresh', `+${added} new games (total ${merged.length})`);
      set({
        games: merged,
        repertoires,
        color,
        status: 'ready',
        savedAt,
        newestAt: newest,
        lastAdded: added,
        path: [],
        fen: START_FEN,
      });
    } catch (e) {
      const msg =
        e instanceof ImportError
          ? e.message
          : 'Refresh failed. Your cached games are still here — try again.';
      logError('refresh', `Refresh failed: ${msg}`, e);
      // Keep existing data; just surface the error.
      set({ status: 'ready', error: msg });
    }
  },

  hydrate: async () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    try {
      const saved = await loadSession();
      if (!saved) {
        set({ hydrating: false });
        return;
      }
      const { repertoires, color } = buildAll(saved.games);
      logInfo(
        'hydrate',
        `Restored ${saved.games.length} games for ${saved.site}/${saved.username} from cache`,
      );
      set({
        site: saved.site,
        username: saved.username,
        games: saved.games,
        repertoires,
        color,
        status: 'ready',
        savedAt: saved.savedAt,
        newestAt: saved.newestAt ?? newestTimestamp(saved.games),
        path: [],
        fen: START_FEN,
        hydrating: false,
      });
    } catch (e) {
      logError('hydrate', 'Failed to restore cached games', e);
      set({ hydrating: false });
    }
  },

  clearSaved: async () => {
    await clearSession();
    set({
      games: [],
      repertoires: null,
      status: 'idle',
      error: undefined,
      savedAt: undefined,
      newestAt: undefined,
      lastAdded: undefined,
      path: [],
      fen: START_FEN,
    });
  },

  setColor: (color) => set({ color, path: [], fen: START_FEN }),

  navTo: (path) => set({ path, fen: fenForPath(path) }),

  push: (san) => {
    const { path } = get();
    const c = new Chess();
    for (const m of path) {
      try {
        c.move(m);
      } catch {
        return false;
      }
    }
    try {
      const mv = c.move(san);
      if (!mv) return false;
      set({ path: [...path, mv.san], fen: c.fen() });
      return true;
    } catch {
      return false;
    }
  },

  pop: () => {
    const { path } = get();
    if (!path.length) return;
    const next = path.slice(0, -1);
    set({ path: next, fen: fenForPath(next) });
  },

  toStart: () => set({ path: [], fen: START_FEN }),

  current: () => {
    const { repertoires, color, path } = get();
    if (!repertoires) return null;
    return nodeAtPath(repertoires[color].tree, path);
  },

  repertoire: () => {
    const { repertoires, color } = get();
    return repertoires ? repertoires[color] : null;
  },
}));
