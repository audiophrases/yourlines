import type { ReactNode } from 'react';

/** Win / Draw / Loss stacked bar. Counts are from the user's perspective. */
export function ScoreBar({
  wins,
  draws,
  losses,
  height = 8,
  showLabels = false,
}: {
  wins: number;
  draws: number;
  losses: number;
  height?: number;
  showLabels?: boolean;
}) {
  const total = Math.max(1, wins + draws + losses);
  const w = (wins / total) * 100;
  const d = (draws / total) * 100;
  const l = (losses / total) * 100;
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full bg-ink-700"
        style={{ height }}
      >
        <div style={{ width: `${w}%` }} className="bg-emerald" />
        <div style={{ width: `${d}%` }} className="bg-ink-500" />
        <div style={{ width: `${l}%` }} className="bg-rose" />
      </div>
      {showLabels && (
        <div className="mt-1 flex justify-between text-[11px] text-mist-500">
          <span className="text-emerald">{wins}W</span>
          <span>{draws}D</span>
          <span className="text-rose">{losses}L</span>
        </div>
      )}
    </div>
  );
}

/** A colored score chip like "58%". */
export function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone =
    score >= 0.55
      ? 'text-emerald bg-emerald/10'
      : score >= 0.47
        ? 'text-amber bg-amber/10'
        : 'text-rose bg-rose/10';
  return (
    <span className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {pct}%
    </span>
  );
}

export function Pill({
  children,
  tone = 'default',
  title,
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'muted';
  title?: string;
}) {
  const cls =
    tone === 'accent'
      ? 'bg-amber/15 text-amber border-amber/20'
      : tone === 'muted'
        ? 'bg-ink-800 text-mist-500 border-ink-700'
        : 'bg-ink-700 text-mist-300 border-ink-600';
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-ink-700 bg-ink-850/80 ${className}`}>
      {children}
    </div>
  );
}

/** Move number label like "1." or "1…" given a ply (1-based move index). */
export function moveNumber(ply: number): string {
  const n = Math.ceil(ply / 2);
  return ply % 2 === 1 ? `${n}.` : `${n}…`;
}
