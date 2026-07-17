import { useMemo, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { useSharedEval } from '../hooks/EvalContext';
import { nameSegments } from '../lib/openings';
import { score } from '../lib/tree';
import { formatEval } from '../lib/engine';
import { uciToSan } from '../lib/chessUtil';
import { ScoreBar, ScorePill, moveNumber } from './ui';

export function LinePanel() {
  const path = useStore((s) => s.path);
  const fen = useStore((s) => s.fen);
  const color = useStore((s) => s.color);
  const node = useStore((s) => s.current());
  const navTo = useStore((s) => s.navTo);
  const pop = useStore((s) => s.pop);
  const toStart = useStore((s) => s.toStart);
  const engineOn = useStore((s) => s.engineOn);
  const setEngineOn = useStore((s) => s.setEngineOn);

  const segments = node?.namePath ? nameSegments(node.namePath.name) : [];
  const eco = node?.namePath?.eco;

  return (
    <div className="flex flex-col gap-3">
      {/* Opening name, general → specific */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {eco && (
          <span className="rounded-md bg-ink-700 px-1.5 py-0.5 font-mono text-[11px] text-mist-400">
            {eco}
          </span>
        )}
        {segments.length === 0 ? (
          <span className="text-sm text-mist-400">
            {path.length === 0
              ? 'Starting position'
              : node
                ? 'Unnamed position'
                : 'Beyond your common lines — stepping through a game'}
          </span>
        ) : (
          segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-500">›</span>}
              <span
                className={
                  i === segments.length - 1
                    ? 'text-sm font-semibold text-mist-100'
                    : 'text-sm text-mist-400'
                }
              >
                {seg}
              </span>
            </span>
          ))
        )}
      </div>

      {/* Move breadcrumb */}
      <div className="flex flex-wrap items-center gap-1">
        {path.length === 0 && (
          <span className="text-xs text-mist-500">No moves yet — drag a piece or pick a line.</span>
        )}
        {path.map((m, i) => (
          <button
            key={i}
            onClick={() => navTo(path.slice(0, i + 1))}
            className={`rounded px-1.5 py-0.5 font-mono text-xs transition-colors ${
              i === path.length - 1
                ? 'bg-amber/20 text-amber'
                : 'text-mist-300 hover:bg-ink-700'
            }`}
          >
            {i % 2 === 0 && <span className="text-mist-500">{moveNumber(i + 1)} </span>}
            {m}
          </button>
        ))}
      </div>

      {/* Node stats + nav */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          <NavBtn onClick={toStart} disabled={!path.length} label="Start">
            ⏮
          </NavBtn>
          <NavBtn onClick={pop} disabled={!path.length} label="Back">
            ◀
          </NavBtn>
        </div>
        {node && node.games > 0 && (
          <div className="flex flex-1 items-center gap-3">
            <span className="text-xs text-mist-500">
              {node.games} game{node.games === 1 ? '' : 's'}
            </span>
            <div className="w-24">
              <ScoreBar wins={node.wins} draws={node.draws} losses={node.losses} height={6} />
            </div>
            <ScorePill score={score(node)} />
          </div>
        )}
        <button
          onClick={() => setEngineOn(!engineOn)}
          className={`ml-auto rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
            engineOn
              ? 'border-teal/40 bg-teal/10 text-teal'
              : 'border-ink-600 bg-ink-800 text-mist-400 hover:text-mist-200'
          }`}
        >
          {engineOn ? '⚙ Engine on' : '⚙ Engine'}
        </button>
      </div>

      {engineOn && <EngineReadout fen={fen} color={color} />}
    </div>
  );
}

function EngineReadout({ fen, color }: { fen: string; color: 'white' | 'black' }) {
  const { line, status } = useSharedEval();
  const pvSan = useMemo(() => (line ? uciToSan(fen, line.pv, 6) : []), [fen, line]);

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-xs text-rose">
        Engine failed to load. Your browser may block the WASM worker.
      </div>
    );
  }

  const evalStr = line ? formatEval(line, color) : '…';
  const good = line?.mate !== undefined ? line.mate > 0 : (line?.scoreCp ?? 0) >= 0;
  const evalFromUser = line
    ? line.mate !== undefined
      ? (color === 'white' ? line.mate : -line.mate) > 0
      : (color === 'white' ? line.scoreCp ?? 0 : -(line.scoreCp ?? 0)) >= 0
    : good;

  return (
    <div className="rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2">
      <div className="flex items-center gap-3">
        <span
          className={`rounded-md px-2 py-0.5 font-mono text-sm font-bold tabular-nums ${
            evalFromUser ? 'bg-emerald/15 text-emerald' : 'bg-rose/15 text-rose'
          }`}
        >
          {evalStr}
        </span>
        <span className="text-xs text-mist-500">
          {status === 'thinking' ? 'analysing…' : `depth ${line?.depth ?? 0}`}
        </span>
        <span className="ml-auto truncate font-mono text-xs text-mist-300">
          {pvSan.join(' ')}
        </span>
      </div>
    </div>
  );
}

function NavBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-600 bg-ink-800 text-xs text-mist-300 transition-colors hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
