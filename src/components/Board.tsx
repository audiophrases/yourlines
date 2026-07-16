import { useMemo, type CSSProperties } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import { useStore } from '../store/useStore';
import { useSharedEval } from '../hooks/EvalContext';
import { formatEval, evalToBar } from '../lib/engine';

const LIGHT = '#e9edf4';
const DARK = '#7f93b3';
const HILITE = 'rgba(242, 181, 68, 0.42)';

export function Board() {
  const fen = useStore((s) => s.fen);
  const path = useStore((s) => s.path);
  const color = useStore((s) => s.color);
  const push = useStore((s) => s.push);
  const engineOn = useStore((s) => s.engineOn);

  const { line } = useSharedEval();

  // Squares of the last played move, for highlighting.
  const lastMoveStyles = useMemo(() => {
    if (!path.length) return {};
    const c = new Chess();
    for (const m of path) {
      try {
        c.move(m);
      } catch {
        break;
      }
    }
    const hist = c.history({ verbose: true });
    const last = hist[hist.length - 1];
    if (!last) return {};
    return {
      [last.from]: { background: HILITE },
      [last.to]: { background: HILITE },
    } as Record<string, CSSProperties>;
  }, [path]);

  const arrows = useMemo(() => {
    if (!engineOn || !line?.bestMove || line.bestMove.length < 4) return [];
    return [
      {
        startSquare: line.bestMove.slice(0, 2),
        endSquare: line.bestMove.slice(2, 4),
        color: '#4fd1c5',
      },
    ];
  }, [engineOn, line]);

  const options = {
    position: fen,
    boardOrientation: color,
    animationDurationInMs: 150,
    lightSquareStyle: { backgroundColor: LIGHT },
    darkSquareStyle: { backgroundColor: DARK },
    squareStyles: lastMoveStyles,
    arrows,
    darkSquareNotationStyle: { color: LIGHT },
    lightSquareNotationStyle: { color: DARK },
    boardStyle: {
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 18px 50px -20px rgba(0,0,0,0.75)',
    },
    onPieceDrop: ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (!targetSquare) return false;
      const c = new Chess(fen);
      try {
        const mv = c.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
        if (!mv) return false;
        push(mv.san);
        return true;
      } catch {
        return false;
      }
    },
  };

  const barFill = engineOn && line ? evalToBar(line) : 0.5;

  return (
    <div className="flex gap-3">
      {/* Eval bar */}
      <div
        className={`relative w-3 shrink-0 overflow-hidden rounded-full transition-opacity ${
          engineOn ? 'opacity-100' : 'opacity-30'
        }`}
        style={{ background: DARK }}
        title={engineOn && line ? formatEval(line, color) : 'Engine off'}
      >
        <div
          className="absolute inset-x-0 bottom-0 bg-mist-100 transition-[height] duration-300 ease-out"
          style={{ height: `${(color === 'white' ? barFill : 1 - barFill) * 100}%` }}
        />
      </div>
      {/* Board */}
      <div className="min-w-0 flex-1">
        <Chessboard options={options} />
      </div>
    </div>
  );
}
