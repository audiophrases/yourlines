import { useStore } from '../store/useStore';
import { findOpeningNode, score } from '../lib/tree';
import { ScoreBar, ScorePill } from './ui';

export function CommonOpenings() {
  const repertoire = useStore((s) => s.repertoire());
  const navTo = useStore((s) => s.navTo);

  if (!repertoire) return null;
  const openings = repertoire.openings;
  const total = repertoire.games || 1;

  if (!openings.length) {
    return (
      <p className="px-2 py-6 text-center text-sm text-mist-500">
        No named openings found for this color yet.
      </p>
    );
  }

  return (
    <div className="scroll-slim flex max-h-full flex-col gap-2 overflow-y-auto pr-1">
      {openings.map((o) => {
        const node = findOpeningNode(repertoire.tree, o.family);
        const share = Math.round((o.games / total) * 100);
        return (
          <button
            key={o.family}
            onClick={() => node && navTo(node.line)}
            className="group rounded-xl border border-ink-700 bg-ink-850/70 px-3 py-2.5 text-left transition-colors hover:border-ink-600 hover:bg-ink-800"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-mist-500">{o.eco}</span>
              <span className="truncate text-sm font-semibold text-mist-100">{o.family}</span>
              <span className="ml-auto shrink-0 text-xs text-mist-500">
                {o.games} · {share}%
              </span>
            </div>
            <div className="mt-0.5 truncate text-xs text-mist-500">{o.topName}</div>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1">
                <ScoreBar
                  wins={o.wins}
                  draws={o.draws}
                  losses={o.losses}
                  height={7}
                  showLabels
                />
              </div>
              <ScorePill score={score(o)} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
