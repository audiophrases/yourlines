import { useEffect, useMemo } from 'react';
import { Chess } from 'chess.js';
import { useStore, type Tab } from './store/useStore';
import { withMoveNumbers } from './lib/chessUtil';
import { fenToEpd } from './lib/openings';
import { findNodeByEpd, MAX_PLY } from './lib/tree';
import { filterByWindow } from './lib/timeFilter';
import { gamesThroughPath } from './lib/gamesQuery';
import { EvalProvider } from './hooks/EvalContext';
import { ImportBar } from './components/ImportBar';
import { ProfileBar } from './components/ProfileBar';
import { TimeFilter } from './components/TimeFilter';
import { DebugPanel } from './components/DebugPanel';
import { Board } from './components/Board';
import { LinePanel } from './components/LinePanel';
import { OpeningTree } from './components/OpeningTree';
import { CommonOpenings } from './components/CommonOpenings';
import { Weaknesses } from './components/Weaknesses';
import { GamesList } from './components/GamesList';
import { score } from './lib/tree';
import type { Color } from './lib/types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'tree', label: 'Lines tree' },
  { id: 'openings', label: 'Your openings' },
  { id: 'weak', label: 'Weak spots' },
  { id: 'games', label: 'Games' },
];

/**
 * Reverse deep link: /?pgn= or /?moves= jumps to that line; /?fen= searches
 * the user's trees for the position (transposition-aware via EPD) — "how do
 * MY games handle this?" from anywhere in the suite. Runs once after hydrate.
 */
let deepLinkConsumed = false;

function consumeDeepLink() {
  // Only the invocation that follows the *completed* hydration may run
  // (StrictMode double-invokes the effect; the early-returning hydrate call
  // resolves before restoration finishes and would race the state reset).
  if (deepLinkConsumed || useStore.getState().hydrating) return;
  deepLinkConsumed = true;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    return;
  }
  const fen = params.get('fen');
  const pgn = params.get('pgn');
  const moves = params.get('moves');
  if (!fen && !pgn && !moves) return;
  window.history.replaceState({}, '', window.location.pathname);

  const st = useStore.getState();
  let sans: string[] | null = null;
  if (moves) {
    sans = moves
      .replace(/\d+\.(\.\.)?/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  } else if (pgn) {
    try {
      const c = new Chess();
      c.loadPgn(pgn);
      sans = c.history();
    } catch {
      st.setNotice('Could not read the game in that link.');
      return;
    }
  }
  if (sans) {
    st.navTo(sans.slice(0, MAX_PLY));
    st.setTab('games');
    return;
  }
  if (fen) {
    if (!st.repertoires) {
      st.setNotice('Import your games first, then position search works from anywhere in the suite.');
      return;
    }
    const epd = fenToEpd(fen);
    const inCurrent = findNodeByEpd(st.repertoires[st.color].tree, epd);
    if (inCurrent) {
      st.navTo(inCurrent.line);
      st.setTab('games');
      return;
    }
    const other = st.color === 'white' ? 'black' : 'white';
    const inOther = findNodeByEpd(st.repertoires[other].tree, epd);
    if (inOther) {
      st.setColor(other);
      st.navTo(inOther.line);
      st.setTab('games');
      return;
    }
    st.setNotice('That position does not appear in your imported games.');
  }
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-amber text-lg font-black text-ink-950 shadow-[0_6px_16px_-6px_rgba(242,181,68,0.7)]">
        ♞
      </div>
      <div className="leading-none">
        <div className="text-[15px] font-bold tracking-tight text-mist-100">
          your<span className="text-amber">lines</span>
        </div>
        <div className="text-[10px] uppercase tracking-widest text-mist-500">chess suite</div>
      </div>
    </div>
  );
}

/** The current board as a deep-link target for the analysis board (/play/):
 *  the line so far as numbered movetext, or nothing at the start position. */
function playHref(): string {
  const { path, fen } = useStore.getState();
  if (path.length) return `/play/?pgn=${encodeURIComponent(withMoveNumbers(1, path))}`;
  if (fen && !fen.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'))
    return `/play/?fen=${encodeURIComponent(fen)}`;
  return '/play/';
}

/** Links to the other apps in the suite (synced into public/ by sync-apps). */
function SuiteNav() {
  const apps = [
    { label: 'Lines', href: '/', active: true },
    { label: 'Play', href: '/play/' },
    { label: 'Gym', href: '/gym/' },
    { label: 'Review', href: '/review/' },
  ];
  return (
    <nav className="flex items-center gap-1 rounded-full border border-ink-700 bg-ink-850 p-0.5">
      {apps.map((a) => (
        <a
          key={a.label}
          href={a.href}
          title={
            a.label === 'Play'
              ? 'Open the analysis board with the current position'
              : a.label === 'Gym'
                ? 'Find trainer lines matching the current position'
                : undefined
          }
          onClick={
            a.label === 'Play'
              ? (e) => {
                  e.preventDefault();
                  window.location.href = playHref();
                }
              : a.label === 'Gym'
                ? (e) => {
                    e.preventDefault();
                    const { path } = useStore.getState();
                    window.location.href = path.length
                      ? `/gym/?lookup=${encodeURIComponent(path.join(' '))}`
                      : '/gym/';
                  }
                : undefined
          }
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            a.active
              ? 'bg-amber/15 text-amber'
              : 'text-mist-400 hover:bg-ink-700 hover:text-mist-100'
          }`}
        >
          {a.label}
        </a>
      ))}
    </nav>
  );
}

export default function App() {
  const hasData = useStore((s) => s.repertoires != null);
  const hydrating = useStore((s) => s.hydrating);
  const hydrate = useStore((s) => s.hydrate);
  const notice = useStore((s) => s.notice);
  const setNotice = useStore((s) => s.setNotice);

  // Restore a previous import from storage, then honor any deep link.
  useEffect(() => {
    void hydrate().then(consumeDeepLink);
  }, [hydrate]);

  return (
    <EvalProvider>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/70 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 px-4 py-3">
            <Logo />
            <SuiteNav />
            {hasData && (
              <div className="ml-auto w-full max-w-md">
                <ImportBar compact />
              </div>
            )}
          </div>
        </header>

        {notice && (
          <div className="mx-auto w-full max-w-[1400px] px-4 pt-3">
            <div className="flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/5 px-3 py-1.5 text-xs text-amber">
              <span>{notice}</span>
              <button
                onClick={() => setNotice(undefined)}
                className="ml-auto text-amber/70 hover:text-amber"
              >
                ✕
              </button>
            </div>
          </div>
        )}
        {hydrating ? (
          <Restoring />
        ) : hasData ? (
          <>
            <ProfileBar />
            <Workspace />
          </>
        ) : (
          <Landing />
        )}
      </div>
      <DebugPanel />
    </EvalProvider>
  );
}

function Restoring() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 text-mist-500">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-ink-600 border-t-amber" />
      <span className="text-sm">Restoring your games…</span>
    </main>
  );
}

function Landing() {
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const progress = useStore((s) => s.progress);
  const setSite = useStore((s) => s.setSite);
  const setUsername = useStore((s) => s.setUsername);
  const runImport = useStore((s) => s.runImport);

  const examples: { site: 'chesscom' | 'lichess'; user: string }[] = [
    { site: 'chesscom', user: 'Hikaru' },
    { site: 'chesscom', user: 'MagnusCarlsen' },
    { site: 'lichess', user: 'DrNykterstein' },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="animate-fadein">
        <h1 className="text-4xl font-black tracking-tight text-mist-100 sm:text-5xl">
          Study <span className="text-amber">your</span> openings.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-mist-400">
          Pull your real games from Chess.com or Lichess, see every line you play as a named
          tree from broad to specific, and let Stockfish pinpoint where you drift off.
        </p>

        <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-ink-700 bg-ink-850/70 p-4 shadow-2xl">
          <ImportBar />
          {status === 'loading' && (
            <p className="mt-3 text-sm text-mist-400">
              Importing games… <span className="tabular-nums text-amber">{progress}</span> so far
            </p>
          )}
          {status === 'error' && error && (
            <p className="mt-3 rounded-lg border border-rose/30 bg-rose/5 px-3 py-2 text-sm text-rose">
              {error}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-mist-500">
            <span>Try:</span>
            {examples.map((ex) => (
              <button
                key={`${ex.site}:${ex.user}`}
                onClick={() => {
                  setSite(ex.site);
                  setUsername(ex.user);
                  runImport();
                }}
                className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-mist-300 transition-colors hover:border-amber/40 hover:text-amber"
              >
                {ex.user}
                <span className="ml-1 text-mist-500">
                  {ex.site === 'chesscom' ? 'chess.com' : 'lichess'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mx-auto mt-10 grid max-w-lg grid-cols-3 gap-3 text-left">
          <Feature title="Named tree" desc="Every move labeled, general → specific." />
          <Feature title="Your stats" desc="Win rates on the lines you actually play." />
          <Feature title="Engine check" desc="Stockfish confirms the real mistakes." />
        </div>
      </div>
    </main>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-850/50 p-3">
      <div className="text-sm font-semibold text-mist-200">{title}</div>
      <div className="mt-1 text-xs text-mist-500">{desc}</div>
    </div>
  );
}

function Workspace() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const repertoire = useStore((s) => s.repertoire());
  const games = useStore((s) => s.games);
  const color = useStore((s) => s.color);
  const path = useStore((s) => s.path);
  const timeFilter = useStore((s) => s.timeFilter);

  // Live count of games reaching the current position (shown on the Games tab).
  const gamesHere = useMemo(
    () => gamesThroughPath(filterByWindow(games, timeFilter), color, path).length,
    [games, color, path, timeFilter],
  );

  return (
    <main className="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Board column */}
      <section className="flex flex-col gap-3">
        <ColorSummary />
        <div className="mx-auto w-full max-w-[560px]">
          <Board />
        </div>
        <div className="mx-auto w-full max-w-[560px] rounded-xl border border-ink-700 bg-ink-850/70 p-3">
          <LinePanel />
        </div>
      </section>

      {/* Analysis column */}
      <section className="flex min-h-[70vh] flex-col rounded-xl border border-ink-700 bg-ink-900/50">
        <div className="flex gap-1 border-b border-ink-800 p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-ink-800 text-mist-100'
                  : 'text-mist-400 hover:text-mist-200'
              }`}
            >
              {t.label}
              {t.id === 'weak' && repertoire && repertoire.weaknesses.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber/20 px-1.5 text-[11px] text-amber">
                  {repertoire.weaknesses.length}
                </span>
              )}
              {t.id === 'games' && gamesHere > 0 && (
                <span className="ml-1.5 rounded-full bg-ink-700 px-1.5 text-[11px] tabular-nums text-mist-400">
                  {gamesHere}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 p-2.5">
          {tab === 'tree' && <OpeningTree />}
          {tab === 'openings' && <CommonOpenings />}
          {tab === 'weak' && <Weaknesses />}
          {tab === 'games' && <GamesList />}
        </div>
      </section>
    </main>
  );
}

function ColorSummary() {
  const repertoires = useStore((s) => s.repertoires);
  const color = useStore((s) => s.color);
  const setColor = useStore((s) => s.setColor);
  if (!repertoires) return null;

  const rep = repertoires[color];
  const s = rep.games ? score(rep.tree) : 0;

  const btn = (c: Color, label: string) => (
    <button
      onClick={() => setColor(c)}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
        color === c
          ? 'border-amber/40 bg-amber/10 text-mist-100'
          : 'border-ink-700 bg-ink-850 text-mist-400 hover:text-mist-200'
      }`}
    >
      <span
        className={`h-3 w-3 rounded-full border ${
          c === 'white' ? 'border-mist-300 bg-mist-100' : 'border-ink-500 bg-ink-950'
        }`}
      />
      {label}
      <span className="text-xs text-mist-500">{repertoires[c].games}</span>
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2">
        {btn('white', 'As White')}
        {btn('black', 'As Black')}
      </div>
      <TimeFilter />
      {rep.games > 0 && (
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-mist-500">score</span>
          <span
            className={`font-bold tabular-nums ${s >= 0.5 ? 'text-emerald' : 'text-rose'}`}
          >
            {Math.round(s * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
