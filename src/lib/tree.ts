import { Chess } from 'chess.js';
import { fenToEpd, openingForEpd, openingFamily } from './openings';
import type { Color, Game, GameResult, Opening, TreeNode, Weakness } from './types';

/** How many plies deep to build the opening tree (12 full moves). */
export const MAX_PLY = 24;

/** Score from the user's perspective: win = 1, draw = 0.5, loss = 0. */
export function score(n: { wins: number; draws: number; games: number }): number {
  return n.games ? (n.wins + 0.5 * n.draws) / n.games : 0;
}

function addResult(n: TreeNode, r: GameResult) {
  n.games++;
  if (r === 'win') n.wins++;
  else if (r === 'loss') n.losses++;
  else n.draws++;
}

function makeChild(parent: TreeNode, san: string, fen: string, ply: number): TreeNode {
  const epd = fenToEpd(fen);
  const opening = openingForEpd(epd);
  const turn: Color = fen.split(' ')[1] === 'w' ? 'white' : 'black';
  return {
    move: san,
    line: [...parent.line, san],
    epd,
    fen,
    ply,
    turn,
    opening,
    namePath: opening ?? parent.namePath,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    children: {},
  };
}

/**
 * Build the aggregated opening tree for the user's games of a given color.
 * The root is the starting position; each child is a move actually played,
 * with win/loss/draw counts from the user's perspective accumulated along the
 * path. Every node inherits the most specific ECO name reached so far.
 */
export function buildTree(games: Game[], color: Color, maxPly = MAX_PLY): TreeNode {
  const startFen = new Chess().fen();
  const root: TreeNode = {
    move: '',
    line: [],
    epd: fenToEpd(startFen),
    fen: startFen,
    ply: 0,
    turn: 'white',
    opening: undefined,
    namePath: undefined,
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    children: {},
  };

  for (const game of games) {
    if (game.userColor !== color) continue;
    addResult(root, game.result);
    const chess = new Chess();
    let node = root;
    const limit = Math.min(game.moves.length, maxPly);
    for (let i = 0; i < limit; i++) {
      const san = game.moves[i];
      let ok = true;
      try {
        if (!chess.move(san)) ok = false;
      } catch {
        ok = false;
      }
      if (!ok) break;
      let child = node.children[san];
      if (!child) {
        child = makeChild(node, san, chess.fen(), i + 1);
        node.children[san] = child;
      }
      addResult(child, game.result);
      node = child;
    }
  }
  return root;
}

/** Children of a node, most-played first. */
export function sortedChildren(node: TreeNode): TreeNode[] {
  return Object.values(node.children).sort((a, b) => b.games - a.games);
}

// ── Most common openings ────────────────────────────────────────────────
export interface OpeningStat {
  family: string;
  /** Most common full variation name within this family. */
  topName: string;
  eco: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

/**
 * Group the user's games (of one color) by opening family, attributing each
 * game to the deepest named opening it reached. Returns families sorted by
 * frequency, each annotated with its most common specific variation.
 */
export function summarizeOpenings(
  games: Game[],
  color: Color,
  maxPly = MAX_PLY,
): OpeningStat[] {
  interface Acc {
    family: string;
    games: number;
    wins: number;
    losses: number;
    draws: number;
    variations: Map<string, { name: string; eco: string; count: number }>;
  }
  const byFamily = new Map<string, Acc>();

  for (const game of games) {
    if (game.userColor !== color) continue;
    const deepest = deepestOpening(game.moves, maxPly);
    if (!deepest) continue;
    const family = openingFamily(deepest.name);
    let acc = byFamily.get(family);
    if (!acc) {
      acc = { family, games: 0, wins: 0, losses: 0, draws: 0, variations: new Map() };
      byFamily.set(family, acc);
    }
    acc.games++;
    if (game.result === 'win') acc.wins++;
    else if (game.result === 'loss') acc.losses++;
    else acc.draws++;
    const v = acc.variations.get(deepest.name) ?? { name: deepest.name, eco: deepest.eco, count: 0 };
    v.count++;
    acc.variations.set(deepest.name, v);
  }

  const stats: OpeningStat[] = [];
  for (const acc of byFamily.values()) {
    const top = [...acc.variations.values()].sort((a, b) => b.count - a.count)[0];
    stats.push({
      family: acc.family,
      topName: top?.name ?? acc.family,
      eco: top?.eco ?? '',
      games: acc.games,
      wins: acc.wins,
      losses: acc.losses,
      draws: acc.draws,
    });
  }
  return stats.sort((a, b) => b.games - a.games);
}

/** Most-played named node whose opening family matches — a good line to jump to. */
export function findOpeningNode(root: TreeNode, family: string): TreeNode | null {
  let best: TreeNode | null = null;
  const visit = (n: TreeNode) => {
    if (n.opening && openingFamily(n.opening.name) === family) {
      if (!best || n.games > best.games) best = n;
    }
    for (const c of Object.values(n.children)) visit(c);
  };
  visit(root);
  return best;
}

/** Replay moves and return the deepest position that carries an ECO name. */
function deepestOpening(moves: string[], maxPly: number): Opening | undefined {
  const chess = new Chess();
  let found: Opening | undefined;
  const limit = Math.min(moves.length, maxPly);
  for (let i = 0; i < limit; i++) {
    try {
      if (!chess.move(moves[i])) break;
    } catch {
      break;
    }
    const o = openingForEpd(fenToEpd(chess.fen()));
    if (o) found = o;
  }
  return found;
}

// ── Weakness / improvement detection ────────────────────────────────────
export interface WeaknessOptions {
  minGames?: number;
  /** Lines scoring below this (0..1) are candidates. */
  scoreThreshold?: number;
  maxResults?: number;
}

/**
 * Statistically flag decision points (positions where it's the user's move)
 * that the user reaches often but scores poorly from. Where a better-scoring
 * alternative move exists in the user's own games, it is surfaced. The result
 * is ranked by a severity that rewards larger samples and worse scores.
 */
export function findWeaknesses(
  root: TreeNode,
  color: Color,
  opts: WeaknessOptions = {},
): Weakness[] {
  const minGames = opts.minGames ?? Math.max(4, Math.round(root.games * 0.04));
  const baseline = score(root); // user's overall score for this color
  const threshold = opts.scoreThreshold ?? Math.min(0.47, baseline - 0.03);
  const out: Weakness[] = [];

  const visit = (node: TreeNode) => {
    // A decision point: it's the user's turn and they've been here enough.
    if (node.turn === color && node.ply >= 1 && node.games >= minGames) {
      const kids = sortedChildren(node);
      const main = kids[0];
      if (main && main.games >= minGames) {
        const mainScore = score(main);
        if (mainScore <= threshold) {
          const reasons: string[] = [];
          reasons.push(
            `You score ${pct(mainScore)} playing ${main.move} here (${main.games} game${main.games === 1 ? '' : 's'}).`,
          );
          // Better-scoring alternative among the user's own tries?
          const alt = kids
            .slice(1)
            .filter((k) => k.games >= Math.max(2, minGames / 2))
            .sort((a, b) => score(b) - score(a))[0];
          if (alt && score(alt) - mainScore > 0.08) {
            reasons.push(
              `${alt.move} scored better for you: ${pct(score(alt))} over ${alt.games} game${alt.games === 1 ? '' : 's'}.`,
            );
          }
          if (baseline - mainScore > 0.05) {
            reasons.push(`That's below your ${pct(baseline)} average as ${color}.`);
          }
          const severity =
            (baseline - mainScore + 0.15) * Math.sqrt(main.games) * depthWeight(node.ply);
          out.push({ node, score: mainScore, games: main.games, reasons, severity });
        }
      }
    }
    for (const child of Object.values(node.children)) visit(child);
  };
  visit(root);

  out.sort((a, b) => b.severity - a.severity);
  // De-duplicate near-identical lines: keep the shallowest of any prefix chain.
  const kept: Weakness[] = [];
  for (const w of out) {
    if (kept.some((k) => isPrefix(k.node.line, w.node.line))) continue;
    kept.push(w);
    if (kept.length >= (opts.maxResults ?? 12)) break;
  }
  return kept;
}

function depthWeight(ply: number): number {
  // Early-opening mistakes recur across many future games, so weight them up,
  // but keep deeper lines relevant too.
  return 1.3 - Math.min(ply, 20) * 0.02;
}

function isPrefix(a: string[], b: string[]): boolean {
  if (a.length > b.length) return false;
  return a.every((m, i) => m === b[i]);
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
