import { Chess } from 'chess.js';
import type { Color, Game, GameResult, Site } from './types';

export interface ImportOptions {
  maxGames?: number;
  signal?: AbortSignal;
  /** Called as games stream in, with the running total so far. */
  onProgress?: (loaded: number, note?: string) => void;
}

export class ImportError extends Error {}

const DEFAULT_MAX = 300;

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
  const max = opts.maxGames ?? DEFAULT_MAX;
  const url =
    `https://lichess.org/api/games/user/${encodeURIComponent(user)}` +
    `?max=${max}&moves=true&pgnInJson=false&clocks=false&evals=false&opening=false&rated=true`;

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
  const max = opts.maxGames ?? DEFAULT_MAX;
  const archivesRes = await fetch(
    `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`,
    { signal: opts.signal },
  );
  if (archivesRes.status === 404) throw new ImportError(`Chess.com user "${user}" not found.`);
  if (!archivesRes.ok) throw new ImportError(`Chess.com API error (${archivesRes.status}).`);
  const { archives } = (await archivesRes.json()) as { archives: string[] };
  if (!archives?.length) return [];

  const games: Game[] = [];
  // Newest month first so recent play dominates the sample.
  for (const archiveUrl of [...archives].reverse()) {
    if (games.length >= max) break;
    const res = await fetch(archiveUrl, { signal: opts.signal });
    if (!res.ok) continue;
    const { games: monthly } = (await res.json()) as { games: ChesscomGame[] };
    // Within a month, newest last — reverse for recency.
    for (const raw of [...(monthly ?? [])].reverse()) {
      if (games.length >= max) break;
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
