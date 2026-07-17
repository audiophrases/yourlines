import { useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store/useStore';
import { exportBackup, relativeTime, type ProfileSummary } from '../lib/storage';

function siteLabel(site: ProfileSummary['site']) {
  return site === 'lichess' ? 'lichess' : 'chess.com';
}

export function ProfileBar() {
  const savedAt = useStore((s) => s.savedAt);
  const status = useStore((s) => s.status);
  const error = useStore((s) => s.error);
  const gameCount = useStore((s) => s.games.length);
  const progress = useStore((s) => s.progress);
  const loadingKind = useStore((s) => s.loadingKind);
  const lastAdded = useStore((s) => s.lastAdded);
  const refresh = useStore((s) => s.refresh);
  const clearSaved = useStore((s) => s.clearSaved);
  const importBackupFile = useStore((s) => s.importBackupFile);

  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loading = status === 'loading';

  if (!savedAt) return null;

  const onExport = async () => {
    try {
      const json = await exportBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yourlines-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote('Export failed.');
    }
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const n = await importBackupFile(text);
      setNote(`Imported ${n} account${n === 1 ? '' : 's'}.`);
    } catch {
      setNote('That file is not a valid yourlines backup.');
    }
    setTimeout(() => setNote(null), 4000);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-ink-800 bg-ink-850/50 px-2.5 py-1.5 text-xs text-mist-500">
        <ProfileDropdown />

        <span className="text-mist-500">
          <span className="text-mist-300">{gameCount.toLocaleString()} games</span> · saved{' '}
          {relativeTime(savedAt)}
        </span>
        {loading && (
          <span className="text-amber">
            · {loadingKind === 'full' ? 'importing all games…' : 'fetching newest…'} {progress || 0}
          </span>
        )}
        {!loading && lastAdded !== undefined && (
          <span className="text-emerald">· {lastAdded > 0 ? `+${lastAdded} new` : 'up to date'}</span>
        )}
        {error && <span className="text-rose">· {error}</span>}
        {note && <span className="text-teal">· {note}</span>}

        <div className="ml-auto flex items-center gap-1.5">
          <BarBtn onClick={() => refresh()} disabled={loading} title="Fetch only games newer than the last import">
            {loading ? 'Refreshing…' : 'Refresh'}
          </BarBtn>
          <BarBtn onClick={onExport} title="Download a JSON backup of all your accounts">
            Export
          </BarBtn>
          <BarBtn onClick={() => fileRef.current?.click()} title="Restore accounts from a backup file">
            Import
          </BarBtn>
          <BarBtn onClick={() => clearSaved()} tone="danger" title="Remove the current account from this device">
            Remove
          </BarBtn>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ProfileDropdown() {
  const profiles = useStore((s) => s.profiles);
  const activeKey = useStore((s) => s.activeKey);
  const switchProfile = useStore((s) => s.switchProfile);
  const removeProfile = useStore((s) => s.removeProfile);
  const [open, setOpen] = useState(false);

  const active = profiles.find((p) => p.key === activeKey);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-mist-200 transition-colors hover:border-ink-600"
      >
        <span className="text-emerald">●</span>
        <span className="font-medium">
          {active ? `${siteLabel(active.site)}/${active.username}` : 'account'}
        </span>
        {profiles.length > 1 && (
          <span className="rounded bg-ink-700 px-1 text-[10px] text-mist-400">{profiles.length}</span>
        )}
        <span className="text-mist-500">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-ink-600 bg-ink-900 py-1 shadow-2xl">
            {profiles.map((p) => (
              <div
                key={p.key}
                className={`group flex items-center gap-2 px-2 py-1.5 ${
                  p.key === activeKey ? 'bg-amber/10' : 'hover:bg-ink-800'
                }`}
              >
                <button
                  onClick={() => {
                    switchProfile(p.key);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      p.key === activeKey ? 'bg-emerald' : 'bg-ink-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-mist-200">
                    {siteLabel(p.site)}/{p.username}
                  </span>
                  <span className="shrink-0 text-[11px] text-mist-500">{p.gameCount}</span>
                </button>
                <button
                  onClick={() => removeProfile(p.key)}
                  title="Remove this account"
                  className="shrink-0 rounded px-1 text-mist-600 opacity-0 transition-opacity hover:text-rose group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="mt-1 border-t border-ink-800 px-2 py-1.5 text-[11px] text-mist-500">
              Type another username above and hit Analyze to add an account.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BarBtn({
  children,
  onClick,
  disabled,
  title,
  tone = 'default',
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border border-ink-700 bg-ink-800 px-2 py-0.5 transition-colors disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-mist-400 hover:border-rose/40 hover:text-rose'
          : 'text-mist-300 hover:text-mist-100'
      }`}
    >
      {children}
    </button>
  );
}
