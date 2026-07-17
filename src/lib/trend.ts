import type { Game } from './types';

/**
 * Direction of a line's results over time, computed *within* whatever set of
 * games it is given (so it naturally respects the active time window): the
 * games are split chronologically into an earlier and a later half and each
 * half is scored. Positive delta = improving lately.
 */
export interface Trend {
  /** Score (0..1) of the earlier half. */
  early: number;
  /** Score (0..1) of the later half. */
  late: number;
  /** late - early. */
  delta: number;
  earlyGames: number;
  lateGames: number;
}

/** Minimum games per half for a trend to be meaningful. */
const MIN_HALF = 3;

function scoreOf(games: Game[]): number {
  let pts = 0;
  for (const g of games) pts += g.result === 'win' ? 1 : g.result === 'draw' ? 0.5 : 0;
  return games.length ? pts / games.length : 0;
}

export function computeTrend(games: Game[]): Trend | null {
  const dated = games.filter((g) => g.date != null);
  if (dated.length < MIN_HALF * 2) return null;
  const sorted = [...dated].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const mid = Math.floor(sorted.length / 2);
  const earlyHalf = sorted.slice(0, mid);
  const lateHalf = sorted.slice(mid);
  if (earlyHalf.length < MIN_HALF || lateHalf.length < MIN_HALF) return null;
  const early = scoreOf(earlyHalf);
  const late = scoreOf(lateHalf);
  return {
    early,
    late,
    delta: late - early,
    earlyGames: earlyHalf.length,
    lateGames: lateHalf.length,
  };
}
