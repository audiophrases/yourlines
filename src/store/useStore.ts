import { create } from 'zustand';
import { Chess } from 'chess.js';
import { importGames, ImportError } from '../lib/chessApi';
import {
  listProfiles,
  loadProfile,
  loadActiveProfile,
  saveProfile,
  deleteProfile,
  setActiveKey,
  newestTimestamp,
  importBackup,
  type ProfileSummary,
} from '../lib/storage';
import {
  buildTree,
  summarizeOpenings,
  findWeaknesses,
  type OpeningStat,
} from '../lib/tree';
import { logInfo, logError } from '../lib/debug';
import { filterByWindow, isTimeWindow, type TimeWindow } from '../lib/timeFilter';
import type { Color, Game, Site, TreeNode, Weakness } from '../lib/types';

const TIME_FILTER_KEY = 'yourlines:timeFilter';

function loadTimeFilter(): TimeWindow {
  try {
    const v = localStorage.getItem(TIME_FILTER_KEY);
    return isTimeWindow(v) ? v : 'all';
  } catch {
    return 'all';
  }
}

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

  /** Analysis time window (view scope; all games stay cached). */
  timeFilter: TimeWindow;

  /** All cached accounts, most-recently-saved first. */
  profiles: ProfileSummary[];
  /** The active profile key ("site:username"), or null when none loaded. */
  activeKey: string | null;

  savedAt?: number;
  newestAt?: number;
  lastAdded?: number;
  hydrated: boolean;
  hydrating: boolean;

  path: string[];
  fen: string;

  engineOn: boolean;
  setEngineOn: (b: boolean) => void;

  setSite: (s: Site) => void;
  setUsername: (u: string) => void;
  runImport: () => Promise<void>;
  refresh: () => Promise<void>;
  hydrate: () => Promise<void>;
  switchProfile: (key: string) => Promise<void>;
  removeProfile: (key: string) => Promise<void>;
  clearSaved: () => Promise<void>;
  importBackupFile: (json: string) => Promise<number>;
  setColor: (c: Color) => void;
  setTimeFilter: (w: TimeWindow) => void;

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

/** Build both repertoires; pick the more-played color as the default view
 *  unless a preferred color is given (to preserve the user's choice). */
function buildAll(
  games: Game[],
  preferColor?: Color,
): {
  repertoires: Record<Color, Repertoire>;
  color: Color;
} {
  const repertoires: Record<Color, Repertoire> = {
    white: buildRepertoire(games, 'white'),
    black: buildRepertoire(games, 'black'),
  };
  const color: Color =
    preferColor ?? (repertoires.white.games >= repertoires.black.games ? 'white' : 'black');
  return { repertoires, color };
}

export const useStore = create<State>((set, get) => {
  /** Build repertoires from the full games, scoped by the active time window. */
  const rebuild = (games: Game[], preferColor?: Color) =>
    buildAll(filterByWindow(games, get().timeFilter), preferColor);

  /** Load a profile from storage into the active view. */
  const activate = (p: {
    key: string;
    site: Site;
    username: string;
    games: Game[];
    savedAt: number;
    newestAt?: number;
  }) => {
    const { repertoires, color } = rebuild(p.games);
    set({
      activeKey: p.key,
      site: p.site,
      username: p.username,
      games: p.games,
      repertoires,
      color,
      status: 'ready',
      savedAt: p.savedAt,
      newestAt: p.newestAt,
      lastAdded: undefined,
      error: undefined,
      path: [],
      fen: START_FEN,
    });
  };

  return {
    site: 'chesscom',
    username: '',
    status: 'idle',
    progress: 0,

    games: [],
    repertoires: null,
    color: 'white',
    timeFilter: loadTimeFilter(),

    profiles: [],
    activeKey: null,

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
        const savedAt = Date.now();
        const newestAt = newestTimestamp(games);
        const summary = await saveProfile({ site, username, games, savedAt, newestAt });
        const profiles = await listProfiles();
        const { repertoires, color } = rebuild(games);
        logInfo(
          'import',
          `Imported ${games.length} games (W:${repertoires.white.games} B:${repertoires.black.games}) for ${summary.key}`,
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
          activeKey: summary.key,
          username: summary.username,
          profiles,
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
      if (!username || !existing.length) return get().runImport();
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
        const savedAt = Date.now();
        const newest = newestTimestamp(merged);
        await saveProfile({ site, username, games: merged, savedAt, newestAt: newest });
        const profiles = await listProfiles();
        const { repertoires } = rebuild(merged, color);
        logInfo('refresh', `+${added} new games (total ${merged.length})`);
        set({
          games: merged,
          repertoires,
          color,
          status: 'ready',
          savedAt,
          newestAt: newest,
          lastAdded: added,
          profiles,
          path: [],
          fen: START_FEN,
        });
      } catch (e) {
        const msg =
          e instanceof ImportError
            ? e.message
            : 'Refresh failed. Your cached games are still here — try again.';
        logError('refresh', `Refresh failed: ${msg}`, e);
        set({ status: 'ready', error: msg });
      }
    },

    hydrate: async () => {
      if (get().hydrated) return;
      set({ hydrated: true });
      try {
        const profiles = await listProfiles();
        const active = await loadActiveProfile();
        if (!active) {
          set({ profiles, hydrating: false });
          return;
        }
        logInfo('hydrate', `Restored ${active.games.length} games for ${active.key}`);
        activate(active);
        set({ profiles, hydrating: false });
      } catch (e) {
        logError('hydrate', 'Failed to restore cached games', e);
        set({ hydrating: false });
      }
    },

    switchProfile: async (key) => {
      if (key === get().activeKey) return;
      const p = await loadProfile(key);
      if (!p) return;
      await setActiveKey(key);
      logInfo('profile', `Switched to ${key} (${p.games.length} games)`);
      activate(p);
    },

    removeProfile: async (key) => {
      await deleteProfile(key);
      const profiles = await listProfiles();
      if (get().activeKey === key) {
        const active = await loadActiveProfile();
        if (active) {
          activate(active);
          set({ profiles });
        } else {
          set({
            profiles,
            activeKey: null,
            games: [],
            repertoires: null,
            status: 'idle',
            savedAt: undefined,
            newestAt: undefined,
            lastAdded: undefined,
            error: undefined,
            path: [],
            fen: START_FEN,
          });
        }
      } else {
        set({ profiles });
      }
    },

    clearSaved: async () => {
      const key = get().activeKey;
      if (key) await get().removeProfile(key);
    },

    importBackupFile: async (json) => {
      const n = await importBackup(json);
      const profiles = await listProfiles();
      set({ profiles });
      if (!get().activeKey && profiles.length) {
        await get().switchProfile(profiles[0].key);
      }
      logInfo('backup', `Imported ${n} profile(s) from backup`);
      return n;
    },

    setColor: (color) => set({ color, path: [], fen: START_FEN }),

    setTimeFilter: (timeFilter) => {
      try {
        localStorage.setItem(TIME_FILTER_KEY, timeFilter);
      } catch {
        /* ignore */
      }
      const { games, color } = get();
      // Rebuild against the new window, preserving the selected color.
      const filtered = filterByWindow(games, timeFilter);
      const { repertoires } = buildAll(filtered, color);
      logInfo('filter', `Time window: ${timeFilter} (${filtered.length}/${games.length} games)`);
      set({ timeFilter, repertoires, path: [], fen: START_FEN, lastAdded: undefined });
    },

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
  };
});
