import { useEffect, useState } from 'react';
import { engine, type EngineLine } from '../lib/engine';

export type EvalStatus = 'idle' | 'thinking' | 'done' | 'error';

/**
 * Analyse a FEN with Stockfish while `enabled`, streaming depth updates.
 * A change of FEN supersedes the previous analysis (see engine.analyse).
 */
export function useEval(fen: string, enabled: boolean, depth = 18) {
  const [line, setLine] = useState<EngineLine | null>(null);
  const [status, setStatus] = useState<EvalStatus>('idle');

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('thinking');
    setLine(null);
    const t = setTimeout(() => {
      engine
        .analyse(fen, depth, (l) => {
          if (!cancelled) setLine(l);
        })
        .then((l) => {
          if (cancelled) return;
          setLine(l);
          setStatus('done');
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          if (e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError') return;
          setStatus('error');
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [fen, enabled, depth]);

  return { line, status };
}
