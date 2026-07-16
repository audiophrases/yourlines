import type { Game, Site } from './types';

/**
 * Local persistence for the last import. We store the raw games (the source of
 * truth) plus the profile; the repertoire trees / openings / weaknesses are
 * cheap to rebuild from games on load, so they are NOT stored — this keeps the
 * payload small and avoids stale derived data.
 */
const KEY = 'yourlines:v1';

export interface SavedSession {
  site: Site;
  username: string;
  games: Game[];
  savedAt: number;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedSession;
    if (!parsed?.games?.length || !parsed.username) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    // Quota exceeded or storage unavailable (e.g. private mode) — non-fatal.
    return false;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
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
