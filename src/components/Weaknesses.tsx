import type { ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { useSharedEval } from '../hooks/EvalContext';
import { sortedChildren } from '../lib/tree';
import { formatEval } from '../lib/engine';
import { uciToSan, withMoveNumbers } from '../lib/chessUtil';
import { nameSegments } from '../lib/openings';
import type { Weakness } from '../lib/types';
import { ScoreBar } from './ui';

export function Weaknesses() {
  const repertoire = useStore((s) => s.repertoire());
  const color = useStore((s) => s.color);
  if (!repertoire) return null;
  const weaknesses = repertoire.weaknesses;

  return (
    <div className="scroll-slim flex max-h-full flex-col gap-2 overflow-y-auto pr-1">
      <p className="px-1 pb-1 text-xs text-mist-500">
        Decision points you reach often as{' '}
        <span className="text-mist-300">{color}</span> but score poorly from. Hit{' '}
        <span className="text-teal">Analyse</span> to check the position with Stockfish.
      </p>
      {weaknesses.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-mist-500">
          No clear weak spots found — either your lines hold up well or there aren't
          enough games yet. Import more games for a sharper read.
        </p>
      ) : (
        weaknesses.map((w, i) => <WeaknessCard key={w.node.line.join('/')} w={w} rank={i + 1} color={color} />)
      )}
    </div>
  );
}

function WeaknessCard({
  w,
  rank,
  color,
}: {
  w: Weakness;
  rank: number;
  color: 'white' | 'black';
}) {
  const path = useStore((s) => s.path);
  const navTo = useStore((s) => s.navTo);
  const setEngineOn = useStore((s) => s.setEngineOn);
  const engineOn = useStore((s) => s.engineOn);
  const { line, status } = useSharedEval();

  const node = w.node;
  const main = sortedChildren(node)[0];
  const active = path.join('/') === node.line.join('/');
  const name = node.namePath ? nameSegments(node.namePath.name).slice(-1)[0] : 'Opening';

  const analyse = () => {
    navTo(node.line);
    setEngineOn(true);
  };

  // Engine verdict (only meaningful when this card's position is the live one).
  let verdict: ReactNode = null;
  if (active && engineOn) {
    if (status === 'error') {
      verdict = <span className="text-rose">Engine unavailable in this browser.</span>;
    } else if (line?.bestMove) {
      const best = uciToSan(node.fen, [line.bestMove])[0];
      const agrees = best === main?.move;
      verdict = (
        <span className="text-mist-300">
          <span className="font-mono text-mist-100">{formatEval(line, color)}</span> at depth{' '}
          {line.depth}.{' '}
          {agrees ? (
            <>
              Engine agrees <span className="font-mono text-emerald">{main?.move}</span> is best.
            </>
          ) : (
            <>
              Engine prefers <span className="font-mono text-teal">{best}</span> over your{' '}
              <span className="font-mono text-amber">{main?.move}</span>.
            </>
          )}
        </span>
      );
    } else {
      verdict = <span className="text-mist-500">analysing…</span>;
    }
  }

  return (
    <div
      className={`rounded-xl border px-3 py-2.5 transition-colors ${
        active ? 'border-amber/40 bg-amber/5' : 'border-ink-700 bg-ink-850/70'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink-700 text-[11px] font-bold text-mist-400">
          {rank}
        </span>
        <span className="truncate text-sm font-semibold text-mist-100">{name}</span>
        <button
          onClick={analyse}
          className="ml-auto shrink-0 rounded-lg border border-teal/40 bg-teal/10 px-2 py-0.5 text-xs font-medium text-teal transition-colors hover:bg-teal/20"
        >
          Analyse
        </button>
      </div>

      <div className="mt-1.5 font-mono text-xs text-mist-400">
        {withMoveNumbers(1, node.line)}
        {main && <span className="text-amber"> {main.move}?</span>}
      </div>

      <ul className="mt-2 space-y-0.5 text-xs text-mist-400">
        {w.reasons.map((r, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-ink-500">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      {main && (
        <div className="mt-2 flex items-center gap-2">
          <span className="w-24 shrink-0 text-[11px] text-mist-500">after {main.move}:</span>
          <div className="flex-1">
            <ScoreBar wins={main.wins} draws={main.draws} losses={main.losses} height={6} />
          </div>
        </div>
      )}

      {verdict && (
        <div className="mt-2 rounded-lg border border-ink-700 bg-ink-900/60 px-2.5 py-1.5 text-xs">
          {verdict}
        </div>
      )}
    </div>
  );
}
