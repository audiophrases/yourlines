import { useStore } from '../store/useStore';
import { TIME_WINDOWS } from '../lib/timeFilter';

/** Scopes the analysis to a recent time window. All games stay cached; this
 *  only changes what the trees / openings / weaknesses are built from. */
export function TimeFilter() {
  const timeFilter = useStore((s) => s.timeFilter);
  const setTimeFilter = useStore((s) => s.setTimeFilter);
  const repertoires = useStore((s) => s.repertoires);
  const total = useStore((s) => s.games.length);
  const filteredTotal = repertoires ? repertoires.white.games + repertoires.black.games : 0;

  return (
    <div className="flex items-center gap-1.5" title="Scope analysis to recent games">
      <span className="text-[11px] uppercase tracking-wide text-mist-500">Recent</span>
      <div className="flex rounded-lg border border-ink-700 bg-ink-850 p-0.5">
        {TIME_WINDOWS.map((w) => (
          <button
            key={w.id}
            onClick={() => setTimeFilter(w.id)}
            title={w.label}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              timeFilter === w.id
                ? 'bg-amber/15 text-amber'
                : 'text-mist-400 hover:text-mist-200'
            }`}
          >
            {w.short}
          </button>
        ))}
      </div>
      {timeFilter !== 'all' && (
        <span className="text-[11px] tabular-nums text-mist-500">
          {filteredTotal} of {total}
        </span>
      )}
    </div>
  );
}
