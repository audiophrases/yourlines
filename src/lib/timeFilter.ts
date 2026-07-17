import type { Game } from './types';

/** Analysis time window. All games stay cached; this only scopes what the
 *  trees / openings / weaknesses are built from. */
export type TimeWindow = 'all' | '1m' | '3m' | '6m' | '1y' | '2y';

export interface TimeWindowDef {
  id: TimeWindow;
  /** Full label for menus / tooltips. */
  label: string;
  /** Compact label for the segmented control. */
  short: string;
  /** Window length in days (0 = all time). */
  days: number;
}

export const TIME_WINDOWS: TimeWindowDef[] = [
  { id: 'all', label: 'All time', short: 'All', days: 0 },
  { id: '1m', label: 'Last month', short: '1M', days: 30 },
  { id: '3m', label: 'Last 3 months', short: '3M', days: 91 },
  { id: '6m', label: 'Last 6 months', short: '6M', days: 182 },
  { id: '1y', label: 'Last year', short: '1Y', days: 365 },
  { id: '2y', label: 'Last 2 years', short: '2Y', days: 730 },
];

const DAY_MS = 86_400_000;

export function isTimeWindow(v: unknown): v is TimeWindow {
  return typeof v === 'string' && TIME_WINDOWS.some((w) => w.id === v);
}

export function windowLabel(id: TimeWindow): string {
  return TIME_WINDOWS.find((w) => w.id === id)?.label ?? 'All time';
}

/**
 * Keep only games played within the window, measured back from today.
 * Undated games are dropped when a window is active (we can't place them).
 */
export function filterByWindow(games: Game[], window: TimeWindow): Game[] {
  if (window === 'all') return games;
  const def = TIME_WINDOWS.find((w) => w.id === window);
  if (!def || !def.days) return games;
  const cutoff = Date.now() - def.days * DAY_MS;
  return games.filter((g) => g.date != null && Date.parse(g.date) >= cutoff);
}
