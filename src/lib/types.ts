// Shared domain types for yourlines.

export type Site = 'lichess' | 'chesscom';
export type Color = 'white' | 'black';
export type GameResult = 'win' | 'loss' | 'draw';

/** A single imported game reduced to what the opening explorer needs. */
export interface Game {
  id: string;
  site: Site;
  /** SAN moves in order, e.g. ["e4", "e5", "Nf3", ...] */
  moves: string[];
  /** Which color the target user played. */
  userColor: Color;
  /** Result from the user's perspective. */
  result: GameResult;
  /** ISO date string if known. */
  date?: string;
  whiteRating?: number;
  blackRating?: number;
  timeClass?: string; // bullet | blitz | rapid | classical | correspondence
  url?: string;
  opponent?: string;
}

/** An ECO opening label for a position. */
export interface Opening {
  eco: string;
  name: string;
}

/**
 * A node in the aggregated opening tree. Each node is a position reached after
 * a specific sequence of moves; children are the moves the user played from it.
 */
export interface TreeNode {
  /** Move (SAN) that led here from the parent. Empty for the root. */
  move: string;
  /** Full move sequence from the start to this node. */
  line: string[];
  /** Position EPD (first 4 FEN fields) at this node. */
  epd: string;
  /** FEN for board display / engine analysis. */
  fen: string;
  /** Ply depth (0 = start). */
  ply: number;
  /** Whose move it is to make from this position. */
  turn: Color;
  /** Opening label for this position, if the position is named. */
  opening?: Opening;
  /**
   * The most specific opening name known for this node — either its own label
   * or inherited from the nearest named ancestor. Used to name every node.
   */
  namePath?: Opening;

  games: number;
  wins: number;
  losses: number;
  draws: number;

  children: Record<string, TreeNode>;
}

/** A flagged weakness in one of the user's common lines. */
export interface Weakness {
  node: TreeNode;
  /** 0..1 score of the user's results from this position onward. */
  score: number;
  games: number;
  /** Why it was flagged (human readable). */
  reasons: string[];
  severity: number; // higher = worse / more worth studying
}
