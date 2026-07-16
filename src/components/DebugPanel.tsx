import { useEffect, useReducer, useState, type ReactNode } from 'react';
import {
  ALPHA,
  subscribe,
  getLogs,
  errorCount,
  clearLogs,
  exportLogs,
  isDebugEnabled,
  setDebugEnabled,
  type LogLevel,
} from '../lib/debug';

function useLogsVersion() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => subscribe(force), []);
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  error: 'text-rose',
  warn: 'text-amber',
  info: 'text-mist-400',
};

export function DebugPanel() {
  useLogsVersion();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(isDebugEnabled());
  if (!ALPHA) return null;

  const logs = getLogs();
  const errors = errorCount();

  const copy = () => navigator.clipboard?.writeText(exportLogs());
  const download = () => {
    const blob = new Blob([exportLogs()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yourlines-debug-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Alpha debug log"
          className={`fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur transition-colors ${
            errors > 0
              ? 'border-rose/40 bg-rose/15 text-rose'
              : 'border-ink-600 bg-ink-850/90 text-mist-400 hover:text-mist-200'
          }`}
        >
          🐞 alpha
          {errors > 0 && (
            <span className="rounded-full bg-rose/30 px-1.5 tabular-nums">{errors}</span>
          )}
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-40 flex h-[60vh] max-h-[560px] w-[min(92vw,460px)] flex-col rounded-xl border border-ink-600 bg-ink-900/95 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-2 border-b border-ink-700 px-3 py-2">
            <span className="text-sm font-semibold text-mist-100">🐞 Debug log</span>
            <span className="text-xs text-mist-500">
              {logs.length} entries
              {errors > 0 && <span className="text-rose"> · {errors} err</span>}
            </span>
            <label className="ml-auto flex items-center gap-1 text-xs text-mist-400">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => {
                  setDebugEnabled(e.target.checked);
                  setEnabled(e.target.checked);
                }}
              />
              on
            </label>
            <button onClick={() => setOpen(false)} className="text-mist-400 hover:text-mist-100">
              ✕
            </button>
          </div>

          <div className="flex gap-1 border-b border-ink-800 px-2 py-1.5 text-xs">
            <PanelBtn onClick={copy}>Copy</PanelBtn>
            <PanelBtn onClick={download}>Download</PanelBtn>
            <PanelBtn onClick={clearLogs}>Clear</PanelBtn>
          </div>

          <div className="scroll-slim flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
            {logs.length === 0 ? (
              <p className="px-1 py-4 text-center text-mist-500">No log entries yet.</p>
            ) : (
              [...logs].reverse().map((e, i) => (
                <div key={logs.length - i} className="border-b border-ink-800/60 py-1">
                  <div className="flex gap-2">
                    <span className="shrink-0 text-mist-600">
                      {new Date(e.t).toLocaleTimeString()}
                    </span>
                    <span className={`shrink-0 ${LEVEL_STYLE[e.level]}`}>{e.level}</span>
                    <span className="shrink-0 text-mist-500">[{e.tag}]</span>
                    <span className="min-w-0 break-words text-mist-200">{e.msg}</span>
                  </div>
                  {e.detail && (
                    <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-ink-950/60 p-1.5 text-[10px] text-mist-500">
                      {e.detail}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PanelBtn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md border border-ink-700 bg-ink-800 px-2 py-1 text-mist-300 transition-colors hover:text-mist-100"
    >
      {children}
    </button>
  );
}
