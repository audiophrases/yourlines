import { Chess } from 'chess.js';

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
