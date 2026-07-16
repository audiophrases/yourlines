import { createContext, useContext, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { useEval, type EvalStatus } from './useEval';
import type { EngineLine } from '../lib/engine';

interface EvalValue {
  line: EngineLine | null;
  status: EvalStatus;
}

const EvalContext = createContext<EvalValue>({ line: null, status: 'idle' });

/**
 * Runs a single Stockfish analysis of the current board position and shares it
 * with every consumer. Because the engine supersedes overlapping requests,
 * analysing in exactly one place avoids components fighting over it.
 */
export function EvalProvider({ children }: { children: ReactNode }) {
  const fen = useStore((s) => s.fen);
  const engineOn = useStore((s) => s.engineOn);
  const value = useEval(fen, engineOn, 20);
  return <EvalContext.Provider value={value}>{children}</EvalContext.Provider>;
}

export function useSharedEval(): EvalValue {
  return useContext(EvalContext);
}
