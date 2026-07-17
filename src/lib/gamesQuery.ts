import type { Color, Game } from './types';

/** Games (of one color) whose moves pass through the given position path. */
export function gamesThroughPath(games: Game[], color: Color, path: string[]): Game[] {
  return games.filter(
    (g) => g.userColor === color && path.every((m, i) => g.moves[i] === m),
  );
}
