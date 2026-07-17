import { Chess } from 'chess.js';
import type { Game } from './types';

/** Convert UCI long-algebraic moves (e.g. "e2e4") to SAN, starting from a FEN. */
export function uciToSan(fen: string, uci: string[], limit = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of uci.slice(0, limit)) {
    try {
      const mv = c.move({
        from: u.slice(0, 2),
        to: u.slice(2, 4),
        promotion: u.length > 4 ? u[4] : undefined,
      });
      if (!mv) break;
      out.push(mv.san);
    } catch {
      break;
    }
  }
  return out;
}

/** Format a SAN line with move numbers starting at a given ply (1-based). */
export function withMoveNumbers(startPly: number, sans: string[]): string {
  let out = '';
  for (let i = 0; i < sans.length; i++) {
    const ply = startPly + i;
    if (ply % 2 === 1) out += `${Math.ceil(ply / 2)}. `;
    else if (i === 0) out += `${Math.ceil(ply / 2)}… `;
    out += `${sans[i]} `;
  }
  return out.trim();
}

/** Render a Game as a PGN string (headers + numbered movetext). */
export function gameToPgn(game: Game, username: string): string {
  const opp = game.opponent ?? 'opponent';
  const white = game.userColor === 'white' ? username : opp;
  const black = game.userColor === 'white' ? opp : username;
  const result =
    game.result === 'draw'
      ? '1/2-1/2'
      : (game.result === 'win') === (game.userColor === 'white')
        ? '1-0'
        : '0-1';
  const d = game.date ? new Date(game.date) : null;
  const date =
    d && !Number.isNaN(d.getTime())
      ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
      : '????.??.??';
  const headers =
    `[Event "${game.site === 'lichess' ? 'Lichess' : 'Chess.com'} game"]\n` +
    (game.url ? `[Site "${game.url}"]\n` : '') +
    `[Date "${date}"]\n[White "${white}"]\n[Black "${black}"]\n[Result "${result}"]\n`;
  let body = '';
  for (let i = 0; i < game.moves.length; i++) {
    if (i % 2 === 0) body += `${i / 2 + 1}. `;
    body += `${game.moves[i]} `;
  }
  return `${headers}\n${body.trim()} ${result}\n`;
}

/** Open the Gym app with a line queued for lookup/training. */
export function handoffToGym(line: string[]): void {
  window.location.href = `/gym/?lookup=${encodeURIComponent(line.join(' '))}`;
}

/** Hand a game off to the Reviewer app (/review/) and navigate there. */
export function handoffToReview(game: Game, username: string): void {
  try {
    localStorage.setItem(
      'yourlines:handoff:review',
      JSON.stringify({ pgn: gameToPgn(game, username), player: username, ts: Date.now() }),
    );
  } catch {
    /* storage unavailable — the navigation still lands on /review/ */
  }
  window.location.href = '/review/';
}
