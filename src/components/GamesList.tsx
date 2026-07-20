import { useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { filterByWindow, windowLabel } from '../lib/timeFilter';
import { gamesThroughPath } from '../lib/gamesQuery';
import { handoffToReview, handoffToPlay } from '../lib/chessUtil';
import { nameSegments } from '../lib/openings';
import { loadReviewsByUrl, type ReviewInfo } from '../lib/reviewArchive';
import { relativeTime } from '../lib/storage';
import { moveNumber } from './ui';
import type { Game } from '../lib/types';

const PAGE = 30;

/** The actual games (for the selected color + time window) whose moves pass
 *  through the current position. Updates live as you navigate the tree. */
export function GamesList() {
  const games = useStore((s) => s.games);
  const color = useStore((s) => s.color);
  const path = useStore((s) => s.path);
  const timeFilter = useStore((s) => s.timeFilter);
  const username = useStore((s) => s.username);
  const navTo = useStore((s) => s.navTo);
  const node = useStore((s) => s.current());
  const [limit, setLimit] = useState(PAGE);

  const matching = useMemo(
    () =>
      gamesThroughPath(filterByWindow(games, timeFilter), color, path).sort((a, b) =>
        (b.date ?? '').localeCompare(a.date ?? ''),
      ),
    [games, color, path, timeFilter],
  );

  // Saved reviews from the Reviewer's archive (same origin), joined by URL.
  const reviews = useMemo(() => loadReviewsByUrl(), [matching]);

  const here =
    path.length === 0
      ? `All your games as ${color}`
      : node?.namePath
        ? nameSegments(node.namePath.name).slice(-1)[0]
        : 'this position';

  return (
    <div className="scroll-slim flex max-h-full flex-col gap-1.5 overflow-y-auto pr-1">
      <p className="px-1 pb-1 text-xs text-mist-500">
        <span className="font-semibold tabular-nums text-mist-300">{matching.length}</span>{' '}
        game{matching.length === 1 ? '' : 's'}
        {path.length > 0 && (
          <>
            {' '}
            reach <span className="text-mist-300">{here}</span>
          </>
        )}
        {path.length === 0 && <> — {here.toLowerCase()}</>}
        {timeFilter !== 'all' && <> · {windowLabel(timeFilter).toLowerCase()}</>}
        {path.length > 0 && (
          <>
            {' '}
            ·{' '}
            <button onClick={() => navTo([])} className="text-amber hover:underline">
              clear position
            </button>
          </>
        )}
      </p>

      {matching.length === 0 ? (
        <p className="px-2 py-6 text-center text-sm text-mist-500">
          No games reach this position with the current filters.
        </p>
      ) : (
        <>
          {matching.slice(0, limit).map((g) => (
            <GameRow
              key={g.id}
              g={g}
              atPly={path.length}
              username={username}
              navTo={navTo}
              review={g.url ? reviews.get(g.url) : undefined}
            />
          ))}
          {matching.length > limit && (
            <button
              onClick={() => setLimit((l) => l + PAGE)}
              className="mx-auto my-2 rounded-lg border border-ink-700 bg-ink-800 px-3 py-1 text-xs text-mist-300 hover:text-mist-100"
            >
              Show more ({matching.length - limit} left)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function GameRow({
  g,
  atPly,
  username,
  navTo,
  review,
}: {
  g: Game;
  atPly: number;
  username: string;
  navTo: (path: string[]) => void;
  review?: ReviewInfo;
}) {
  const oppRating = g.userColor === 'white' ? g.blackRating : g.whiteRating;
  const next = g.moves[atPly];
  const res =
    g.result === 'win'
      ? { t: 'W', cls: 'bg-emerald/15 text-emerald' }
      : g.result === 'loss'
        ? { t: 'L', cls: 'bg-rose/15 text-rose' }
        : { t: 'D', cls: 'bg-ink-700 text-mist-400' };

  return (
    <div className="group flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850/70 px-2.5 py-2 transition-colors hover:border-ink-600">
      <span
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold ${res.cls}`}
      >
        {res.t}
      </span>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
          g.userColor === 'white' ? 'border-mist-300 bg-mist-100' : 'border-ink-500 bg-ink-950'
        }`}
        title={`You played ${g.userColor}`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm text-mist-200">
          <span className="truncate">
            vs {g.opponent ?? '?'}
            {oppRating != null && <span className="text-mist-500"> ({oppRating})</span>}
          </span>
          {/* No rel="noopener" — same-origin suite target; noopener would
              force a fresh tab each click instead of reusing "yourlines-review". */}
          {review && (
            <a
              href={`/review/?archive=${encodeURIComponent(review.id)}`}
              target="yourlines-review"
              title={`Reviewed ${review.savedAt ? relativeTime(review.savedAt) : ''} — ${review.blunders} blunder${review.blunders === 1 ? '' : 's'}, ${review.mistakes} mistake${review.mistakes === 1 ? '' : 's'}${review.brilliant ? `, ${review.brilliant} brilliant` : ''}. Opens the saved review in its own tab.`}
              className="shrink-0 rounded-md border border-teal/40 bg-teal/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal transition-colors hover:bg-teal/25"
            >
              ✓ reviewed
              {review.blunders + review.mistakes > 0 && (
                <span className="ml-1 text-teal/80">
                  {review.blunders > 0 && `${review.blunders}B`}
                  {review.blunders > 0 && review.mistakes > 0 && '·'}
                  {review.mistakes > 0 && `${review.mistakes}M`}
                </span>
              )}
            </a>
          )}
        </div>
        <div className="truncate text-[11px] text-mist-500">
          {g.date ? g.date.slice(0, 10) : '—'} · {g.timeClass ?? '?'} · {g.moves.length} plies
          {next && (
            <>
              {' '}
              · then{' '}
              <span className="font-mono text-mist-300">
                {atPly % 2 === 0 ? moveNumber(atPly + 1) : ''}
                {next}
              </span>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <RowBtn onClick={() => navTo(g.moves)} title="Step through this game on the board here">
          View
        </RowBtn>
        <RowBtn
          onClick={() => handoffToReview(g, username)}
          title="Open in the Reviewer"
          tone="amber"
        >
          Review
        </RowBtn>
        <RowBtn
          onClick={() => handoffToPlay(g, username)}
          title="Open on the analysis board"
          tone="teal"
        >
          Play
        </RowBtn>
        {g.url && (
          <a
            href={g.url}
            target="_blank"
            rel="noreferrer"
            title={`Open the original game on ${g.site === 'lichess' ? 'Lichess' : 'Chess.com'}`}
            className="grid h-6 w-6 place-items-center rounded-md border border-ink-700 bg-ink-800 text-[11px] text-mist-400 transition-colors hover:text-mist-100"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  );
}

function RowBtn({
  children,
  onClick,
  title,
  tone,
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  tone?: 'amber' | 'teal';
}) {
  const cls =
    tone === 'amber'
      ? 'border-amber/40 bg-amber/10 text-amber hover:bg-amber/20'
      : tone === 'teal'
        ? 'border-teal/40 bg-teal/10 text-teal hover:bg-teal/20'
        : 'border-ink-700 bg-ink-800 text-mist-300 hover:text-mist-100';
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}
