import { Chess } from 'chess.js';
import type { Color, Game, GameResult, Site } from './types';

export interface ImportOptions {
  /** Max games to fetch. A number caps it; 'all' (default) fetches everything
   *  up to a safety ceiling. */
  max?: number | 'all';
  /** Only fetch games newer than this timestamp (ms epoch) — incremental refresh. */
  since?: number;
  signal?: AbortSignal;
  /** Called as games stream in, with the running total so far. */
  onProgress?: (loaded: number, note?: string) => void;
}

export class ImportError extends Error {}

/** Absolute ceiling so an enormous account can't hang the tab / fill the disk. */
const HARD_MAX = 25000;

function effectiveMax(max: number | 'all' | undefined): number {
  return typeof max === 'number' ? max : HARD_MAX;
}

/** Year*12 + month (0-based) index for cheap month comparisons. */
function monthIndex(y: number, m0: number): number {
  return y * 12 + m0;
}

/** Chess.com result strings that mean the game was drawn. */
const CHESSCOM_DRAWS = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
]);

export async function importGames(
  site: Site,
  username: string,
  opts: ImportOptions = {},
): Promise<Game[]> {
  const clean = username.trim();
  if (!clean) throw new ImportError('Please enter a username.');
  return site === 'lichess'
    ? importLichess(clean, opts)
    : importChesscom(clean, opts);
}

// ── Lichess ────────────────────────────────────────────────────────────────
// The JSON export gives SAN moves directly in a `moves` string, so no PGN
// parsing is needed. We stream ndjson so results appear as they arrive.
async function importLichess(user: string, opts: ImportOptions): Promise<Game[]> {
  const cap = effectiveMax(opts.max);
  let url =
    `https://lichess.org/api/games/user/${encodeURIComponent(user)}` +
    `?moves=true&pgnInJson=false&clocks=false&evals=false&opening=false&rated=true`;
  if (typeof opts.max === 'number') url += `&max=${opts.max}`;
  if (opts.since) url += `&since=${opts.since}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/x-ndjson' },
    signal: opts.signal,
  });
  if (res.status === 404) throw new ImportError(`Lichess user "${user}" not found.`);
  if (!res.ok) throw new ImportError(`Lichess API error (${res.status}).`);
  if (!res.body) throw new ImportError('Lichess returned no data.');

  const games: Game[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flush = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let raw: LichessGame;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return;
    }
    const g = fromLichess(raw, user);
    if (g) {
      games.push(g);
      opts.onProgress?.(games.length);
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      flush(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
    if (games.length >= cap) {
      await reader.cancel().catch(() => {});
      return games;
    }
  }
  flush(buffer);
  return games;
}

interface LichessGame {
  id: string;
  rated?: boolean;
  variant?: string;
  speed?: string;
  createdAt?: number;
  status?: string;
  winner?: 'white' | 'black';
  moves?: string;
  players?: {
    white?: { user?: { name?: string }; rating?: number };
    black?: { user?: { name?: string }; rating?: number };
  };
}

function fromLichess(g: LichessGame, user: string): Game | null {
  if (g.variant && g.variant !== 'standard') return null;
  if (!g.moves) return null;
  const whiteName = g.players?.white?.user?.name ?? '';
  const blackName = g.players?.black?.user?.name ?? '';
  const lc = user.toLowerCase();
  const userColor: Color =
    whiteName.toLowerCase() === lc ? 'white' : blackName.toLowerCase() === lc ? 'black' : 'white';
  const result: GameResult = !g.winner
    ? 'draw'
    : g.winner === userColor
      ? 'win'
      : 'loss';
  return {
    id: `lichess:${g.id}`,
    site: 'lichess',
    moves: g.moves.split(' ').filter(Boolean),
    userColor,
    result,
    date: g.createdAt ? new Date(g.createdAt).toISOString() : undefined,
    whiteRating: g.players?.white?.rating,
    blackRating: g.players?.black?.rating,
    timeClass: g.speed,
    url: `https://lichess.org/${g.id}`,
    opponent: userColor === 'white' ? blackName : whiteName,
  };
}

// ── Chess.com ────────────────────────────────────────────────────────────
// Games are organised into monthly archives. We fetch newest-first and parse
// each game's PGN with chess.js to extract SAN moves.
interface ChesscomGame {
  url?: string;
  pgn?: string;
  time_class?: string;
  rules?: string;
  end_time?: number;
  white?: { username?: string; rating?: number; result?: string };
  black?: { username?: string; rating?: number; result?: string };
}

async function importChesscom(user: string, opts: ImportOptions): Promise<Game[]> {
  const cap = effectiveMax(opts.max);
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`,
    { signal: opts.signal },
  );
  if (archivesRes.status === 404) throw new ImportError(`Chess.com user "${user}" not found.`);
  if (!archivesRes.ok) throw new ImportError(`Chess.com API error (${archivesRes.status}).`);
  const { archives } = (await archivesRes.json()) as { archives: string[] };
  if (!archives?.length) return [];

  // For incremental refresh, skip whole archive months older than the cursor.
  const sinceMonth = opts.since
    ? monthIndex(new Date(opts.since).getUTCFullYear(), new Date(opts.since).getUTCMonth())
    : -Infinity;

  const games: Game[] = [];
  // Newest month first so recent play dominates and we can stop early.
  for (const archiveUrl of [...archives].reverse()) {
    if (games.length >= cap) break;
    const parts = archiveUrl.split('/');
    const y = Number(parts[parts.length - 2]);
    const m = Number(parts[parts.length - 1]); // 1-based
    if (Number.isFinite(y) && Number.isFinite(m) && monthIndex(y, m - 1) < sinceMonth) break;

    const res = await fetch(archiveUrl, { signal: opts.signal });
    if (!res.ok) continue;
    const { games: monthly } = (await res.json()) as { games: ChesscomGame[] };
    // Within a month, newest last — reverse for recency.
    for (const raw of [...(monthly ?? [])].reverse()) {
      if (games.length >= cap) break;
      // Skip games we already have (older than the cursor).
      if (opts.since && (raw.end_time ?? 0) * 1000 <= opts.since) continue;
      const g = fromChesscom(raw, user);
      if (g) {
        games.push(g);
        opts.onProgress?.(games.length);
      }
    }
  }
  return games;
}

function fromChesscom(g: ChesscomGame, user: string): Game | null {
  if (g.rules && g.rules !== 'chess') return null;
  if (!g.pgn) return null;
  const lc = user.toLowerCase();
  const userColor: Color =
    (g.white?.username ?? '').toLowerCase() === lc ? 'white' : 'black';
  const myResult = (userColor === 'white' ? g.white?.result : g.black?.result) ?? '';
  const result: GameResult =
    myResult === 'win' ? 'win' : CHESSCOM_DRAWS.has(myResult) ? 'draw' : 'loss';

  const moves = pgnToMoves(g.pgn);
  if (!moves.length) return null;

  const id = g.url?.split('/').pop() ?? Math.random().toString(36).slice(2);
  const opp = userColor === 'white' ? g.black?.username : g.white?.username;
  return {
    id: `chesscom:${id}`,
    site: 'chesscom',
    moves,
    userColor,
    result,
    date: g.end_time ? new Date(g.end_time * 1000).toISOString() : undefined,
    whiteRating: g.white?.rating,
    blackRating: g.black?.rating,
    timeClass: g.time_class,
    url: g.url,
    opponent: opp,
  };
}

/** Extract SAN moves from a PGN using chess.js. Returns [] on failure. */
function pgnToMoves(pgn: string): string[] {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history();
  } catch {
    return [];
  }
}
