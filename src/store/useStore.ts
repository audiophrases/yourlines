import { create } from 'zustand';
import { Chess } from 'chess.js';
import { importGames, ImportError } from '../lib/chessApi';
import { loadSession, saveSession, clearSession } from '../lib/storage';
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
  /** Whether we've attempted to restore from localStorage this session. */
  hydrated: boolean;

  /** Current line from the start position (SAN moves). */
  path: string[];
  /** FEN for the current position (kept in sync with path). */
  fen: string;

  /** Whether the Stockfish eval bar / analysis is switched on. */
  engineOn: boolean;
  setEngineOn: (b: boolean) => void;

  setSite: (s: Site) => void;
  setUsername: (u: string) => void;
  runImport: () => Promise<void>;
  /** Restore a previous import from localStorage (idempotent). */
  hydrate: () => void;
  /** Forget the persisted import and reset to the landing screen. */
  clearSaved: () => void;
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
  hydrated: false,

  path: [],
  fen: START_FEN,

  engineOn: false,
  setEngineOn: (engineOn) => set({ engineOn }),

  setSite: (site) => set({ site }),
  setUsername: (username) => set({ username }),

  runImport: async () => {
    const { site, username } = get();
    set({ status: 'loading', error: undefined, progress: 0 });
    try {
      const games = await importGames(site, username, {
        onProgress: (n) => set({ progress: n }),
      });
      if (!games.length) {
        set({ status: 'error', error: 'No standard games found for that account.' });
        return;
      }
      const { repertoires, color } = buildAll(games);
      const savedAt = Date.now();
      // Persist the raw games so a reload restores instantly without re-fetching.
      saveSession({ site, username, games, savedAt });
      set({
        games,
        repertoires,
        color,
        status: 'ready',
        path: [],
        fen: START_FEN,
        savedAt,
        hydrated: true,
      });
    } catch (e) {
      const msg =
        e instanceof ImportError
          ? e.message
          : 'Something went wrong importing games. Check the username and try again.';
      set({ status: 'error', error: msg });
    }
  },

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const saved = loadSession();
    if (!saved) return;
    const { repertoires, color } = buildAll(saved.games);
    set({
      site: saved.site,
      username: saved.username,
      games: saved.games,
      repertoires,
      color,
      status: 'ready',
      savedAt: saved.savedAt,
      path: [],
      fen: START_FEN,
    });
  },

  clearSaved: () => {
    clearSession();
    set({
      games: [],
      repertoires: null,
      status: 'idle',
      error: undefined,
      savedAt: undefined,
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
