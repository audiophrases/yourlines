// A thin, promise-based wrapper around a single-threaded Stockfish worker
// (vendored in /public/engine). Single-threaded means no SharedArrayBuffer and
// therefore no COOP/COEP headers — which is important because those headers
// would break the cross-origin fetches to the Chess.com / Lichess APIs.
import type { Color } from './types';
import { logError, logInfo } from './debug';

export interface EngineLine {
  depth: number;
  /** Centipawns from White's perspective (+ = White better). Undefined if mate. */
  scoreCp?: number;
  /** Mate distance from White's perspective (sign = who mates). */
  mate?: number;
  /** Principal variation in UCI long algebraic (e.g. "e2e4"). */
  pv: string[];
  /** Best move in UCI. */
  bestMove?: string;
}

interface Job {
  fen: string;
  depth: number;
  onInfo?: (l: EngineLine) => void;
  resolve: (l: EngineLine) => void;
  reject: (e: unknown) => void;
}

const ENGINE_ABORT = new DOMException('superseded', 'AbortError');

class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private running = false;
  private next: Job | null = null;
  private cur: { job: Job; best: EngineLine } | null = null;
  private failed = false;

  get supported(): boolean {
    return typeof Worker !== 'undefined';
  }

  private boot(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      try {
        const base = location.origin;
        const url = `${base}/engine/stockfish.js#${base}/engine/stockfish.wasm`;
        const w = new Worker(url);
        this.worker = w;
        const onHandshake = (e: MessageEvent) => {
          const line = String(e.data);
          if (line.includes('uciok')) {
            w.postMessage('isready');
          } else if (line.includes('readyok')) {
            w.removeEventListener('message', onHandshake);
            w.addEventListener('message', (ev) => this.onLine(String(ev.data)));
            logInfo('engine', 'Stockfish ready');
            resolve();
          }
        };
        w.addEventListener('message', onHandshake);
        w.addEventListener('error', (err) => {
          this.failed = true;
          logError('engine', 'Stockfish worker error', (err as ErrorEvent)?.message ?? err);
          reject(err);
        });
        w.postMessage('uci');
      } catch (e) {
        this.failed = true;
        logError('engine', 'Failed to start Stockfish worker', e);
        reject(e);
      }
    });
    return this.ready;
  }

  /** Analyse a position to a fixed depth. A newer call supersedes an older one. */
  async analyse(
    fen: string,
    depth = 18,
    onInfo?: (l: EngineLine) => void,
  ): Promise<EngineLine> {
    if (this.failed) throw new Error('engine-unavailable');
    await this.boot();
    return new Promise<EngineLine>((resolve, reject) => {
      if (this.next) {
        this.next.reject(ENGINE_ABORT);
        this.next = null;
      }
      this.next = { fen, depth, onInfo, resolve, reject };
      if (this.running) {
        this.worker?.postMessage('stop'); // let the current one wind down, then drain
      } else {
        this.drain();
      }
    });
  }

  private drain() {
    if (this.running || !this.next || !this.worker) return;
    const job = this.next;
    this.next = null;
    this.cur = { job, best: { depth: 0, pv: [] } };
    this.running = true;
    this.worker.postMessage('ucinewgame');
    this.worker.postMessage(`position fen ${job.fen}`);
    this.worker.postMessage(`go depth ${job.depth}`);
  }

  private onLine(line: string) {
    if (!this.cur) return;
    if (line.startsWith('info')) {
      const parsed = parseInfo(line, this.cur.job.fen);
      if (parsed) {
        this.cur.best = parsed;
        this.cur.job.onInfo?.(parsed);
      }
    } else if (line.startsWith('bestmove')) {
      const bm = line.split(' ')[1];
      const best = this.cur.best;
      const result: EngineLine = {
        ...best,
        bestMove: bm && bm !== '(none)' ? bm : best.bestMove,
      };
      const job = this.cur.job;
      this.cur = null;
      this.running = false;
      job.resolve(result);
      this.drain();
    }
  }
}

function parseInfo(line: string, fen: string): EngineLine | null {
  const t = line.split(/\s+/);
  let depth = 0;
  let scoreCp: number | undefined;
  let mate: number | undefined;
  let pv: string[] = [];
  for (let i = 0; i < t.length; i++) {
    const w = t[i];
    if (w === 'depth') depth = Number(t[i + 1]);
    else if (w === 'score') {
      if (t[i + 1] === 'cp') scoreCp = Number(t[i + 2]);
      else if (t[i + 1] === 'mate') mate = Number(t[i + 2]);
    } else if (w === 'pv') {
      pv = t.slice(i + 1);
      break;
    }
  }
  if (scoreCp === undefined && mate === undefined) return null;
  // UCI scores are from the side-to-move; normalise to White's perspective.
  const whiteToMove = fen.split(' ')[1] === 'w';
  if (!whiteToMove) {
    if (scoreCp !== undefined) scoreCp = -scoreCp;
    if (mate !== undefined) mate = -mate;
  }
  return { depth, scoreCp, mate, pv, bestMove: pv[0] };
}

/** Format an eval for display, from a chosen perspective. */
export function formatEval(line: EngineLine, perspective: Color = 'white'): string {
  const flip = perspective === 'black' ? -1 : 1;
  if (line.mate !== undefined) {
    const m = line.mate * flip;
    return `M${Math.abs(m)}${m < 0 ? '–' : ''}`; // e.g. M3 or M3– (getting mated)
  }
  if (line.scoreCp !== undefined) {
    const v = (line.scoreCp * flip) / 100;
    return `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
  }
  return '—';
}

/** Advantage as a 0..1 "win probability"-ish bar fill, from White's side. */
export function evalToBar(line: EngineLine): number {
  if (line.mate !== undefined) return line.mate > 0 ? 1 : 0;
  const cp = line.scoreCp ?? 0;
  // Logistic curve; ~+4 pawns ≈ near-winning.
  return 1 / (1 + Math.pow(10, -cp / 400));
}

export const engine = new Engine();
