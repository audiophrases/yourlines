/**
 * Read-only view of the Chess Reviewer's saved-review archive. Same origin, so
 * the archive it keeps in localStorage ('cmr.reviewArchive.v1') is directly
 * readable; reviews are joined to imported games by the game URL, which both
 * sides carry (the [Site]/[Link] PGN header ↔ Game.url).
 */
export interface ReviewInfo {
  id: string;
  title: string;
  savedAt: number;
  brilliant: number;
  mistakes: number;
  blunders: number;
}

const ARCHIVE_KEY = 'cmr.reviewArchive.v1';

function countFrom(summary: string, label: string): number {
  const m = summary.match(new RegExp(`${label}\\s*=\\s*(\\d+)`));
  return m ? Number(m[1]) : 0;
}

/** Map of game URL -> review info for every archived (saved) review. */
export function loadReviewsByUrl(): Map<string, ReviewInfo> {
  const map = new Map<string, ReviewInfo>();
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (!raw) return map;
    const entries = JSON.parse(raw) as Array<{
      id?: string;
      title?: string;
      summary?: string;
      headers?: Record<string, string>;
      createdAt?: number;
      updatedAt?: number;
    }>;
    if (!Array.isArray(entries)) return map;
    for (const e of entries) {
      const url = [e.headers?.Site, e.headers?.Link].find(
        (v) => typeof v === 'string' && v.startsWith('http'),
      );
      if (!url) continue;
      const summary = e.summary ?? '';
      map.set(url, {
        id: e.id ?? '',
        title: e.title ?? '',
        savedAt: e.updatedAt ?? e.createdAt ?? 0,
        brilliant: countFrom(summary, 'Brilliant'),
        mistakes: countFrom(summary, 'Mistakes'),
        blunders: countFrom(summary, 'Blunders'),
      });
    }
  } catch {
    /* unreadable archive — behave as empty */
  }
  return map;
}
