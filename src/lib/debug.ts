// Alpha debug logging. On by default while ALPHA is true: captures uncaught
// errors, unhandled rejections, and explicit app events into a capped ring
// buffer that is persisted to localStorage so bugs can be reviewed later
// (via the on-screen Debug panel, or window.yourlines in the console).

export const ALPHA = true;

const LS_KEY = 'yourlines:logs';
const MAX_ENTRIES = 300;

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  t: number; // epoch ms
  level: LogLevel;
  tag: string;
  msg: string;
  detail?: string;
}

let enabled = ALPHA;
let buffer: LogEntry[] = loadPersisted();
const listeners = new Set<() => void>();
let persistTimer: number | undefined;

function loadPersisted(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as LogEntry[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function persist() {
  if (persistTimer !== undefined) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = undefined;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(buffer));
    } catch {
      /* quota / unavailable — keep going in-memory */
    }
  }, 400);
}

function emit() {
  for (const l of listeners) l();
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack}` : ''}`;
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function log(level: LogLevel, tag: string, msg: string, detail?: unknown) {
  if (!enabled) return;
  const entry: LogEntry = {
    t: Date.now(),
    level,
    tag,
    msg,
    detail: detail === undefined ? undefined : safeStringify(detail),
  };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer = buffer.slice(-MAX_ENTRIES);
  persist();
  emit();
  // Mirror to the console for live development.
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn(`[yourlines:${tag}] ${msg}`, detail ?? '');
}

export const logInfo = (tag: string, msg: string, detail?: unknown) => log('info', tag, msg, detail);
export const logWarn = (tag: string, msg: string, detail?: unknown) => log('warn', tag, msg, detail);
export const logError = (tag: string, msg: string, detail?: unknown) => log('error', tag, msg, detail);

export function getLogs(): readonly LogEntry[] {
  return buffer;
}

export function errorCount(): number {
  return buffer.reduce((n, e) => (e.level === 'error' ? n + 1 : n), 0);
}

export function clearLogs() {
  buffer = [];
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function isDebugEnabled() {
  return enabled;
}

export function setDebugEnabled(v: boolean) {
  enabled = v;
  logInfo('debug', v ? 'Debug logging enabled' : 'Debug logging disabled');
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** A plain-text dump suitable for copying into a bug report. */
export function exportLogs(): string {
  const header =
    `yourlines alpha — debug log\n` +
    `generated: ${new Date().toISOString()}\n` +
    `userAgent: ${navigator.userAgent}\n` +
    `entries: ${buffer.length}\n` +
    `${'-'.repeat(60)}\n`;
  const body = buffer
    .map((e) => {
      const line = `${new Date(e.t).toISOString()}  ${e.level.toUpperCase().padEnd(5)} [${e.tag}] ${e.msg}`;
      return e.detail ? `${line}\n    ${e.detail.replace(/\n/g, '\n    ')}` : line;
    })
    .join('\n');
  return header + body + '\n';
}

let installed = false;

/** Install global error/rejection handlers. Safe to call more than once. */
export function installGlobalHandlers() {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (e) => {
    logError('window', e.message || 'Uncaught error', e.error ?? {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    logError('promise', 'Unhandled promise rejection', e.reason);
  });

  // Console handle for grabbing logs during alpha:  window.yourlines.export()
  (window as unknown as { yourlines?: unknown }).yourlines = {
    logs: getLogs,
    export: exportLogs,
    clear: clearLogs,
    setEnabled: setDebugEnabled,
  };

  logInfo('app', `Session started (alpha, debug ${enabled ? 'on' : 'off'})`);
}
