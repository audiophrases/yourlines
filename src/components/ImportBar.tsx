import { useStore } from '../store/useStore';
import type { Site } from '../lib/types';

const SITES: { id: Site; label: string }[] = [
  { id: 'chesscom', label: 'Chess.com' },
  { id: 'lichess', label: 'Lichess' },
];

export function ImportBar({ compact = false }: { compact?: boolean }) {
  const site = useStore((s) => s.site);
  const setSite = useStore((s) => s.setSite);
  const username = useStore((s) => s.username);
  const setUsername = useStore((s) => s.setUsername);
  const runImport = useStore((s) => s.runImport);
  const status = useStore((s) => s.status);
  const progress = useStore((s) => s.progress);

  const loading = status === 'loading';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'w-full'}`}>
      <div className="flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
        {SITES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSite(s.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              site === s.id
                ? 'bg-ink-700 text-mist-100'
                : 'text-mist-400 hover:text-mist-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500">
            @
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && username.trim() && !loading) runImport();
            }}
            placeholder={site === 'lichess' ? 'lichess username' : 'chess.com username'}
            spellCheck={false}
            autoCapitalize="none"
            className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-7 pr-3 text-sm text-mist-100 outline-none transition-colors placeholder:text-mist-500 focus:border-amber/50"
          />
        </div>
        <button
          onClick={() => runImport()}
          disabled={loading || !username.trim()}
          className="shrink-0 rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-ink-950 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-950/30 border-t-ink-950" />
              {progress || 0}
            </span>
          ) : (
            'Analyze'
          )}
        </button>
      </div>
    </div>
  );
}
