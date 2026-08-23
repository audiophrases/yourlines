// One-click deploy: optionally commit+push a sub-app repo, sync it into the
// suite, gate on a build + a sub-app syntax check, then commit+push
// yourlines — which triggers .github/workflows/deploy.yml and goes live at
// https://audiophrases.github.io/yourlines/ within about a minute.
//
// Usage: node scripts/deploy.mjs [--app <play|gym|review|puzzles|spar>]
// The --app form is what each sub-app's own deploy.bat passes, so running it
// from e.g. yourchesspuzzles takes that repo's changes all the way to the
// live suite in one step. Run with no --app (yourlines/deploy.bat) to just
// sync+build+push yourlines itself (e.g. after editing the hub's own src/).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { suiteApps } from './suite-apps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const siblings = resolve(repoRoot, '..');
const APPS = suiteApps(siblings);

const appArgIdx = process.argv.indexOf('--app');
const appName = appArgIdx !== -1 ? process.argv[appArgIdx + 1] : null;

// git/node are real executables on Windows and don't need a shell; npm is a
// .cmd shim and does (fails with ENOENT otherwise). Only ever called with
// fully static argument arrays, so shell:true carries no injection risk here.
function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}
function runNpm(args, cwd) {
  execFileSync('npm', args, { cwd, stdio: 'inherit', shell: true });
}
function runCapture(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8' });
}
function porcelain(cwd) {
  return runCapture('git', ['status', '--porcelain'], cwd).trim();
}
function die(msg) {
  console.error('\n  ' + msg + '\n');
  process.exit(1);
}

// Filenames that should never be swept into an unattended commit even though
// they're not gitignored — an auto-deploy tool committing a stray credential
// would be a much worse outcome than just stopping and asking a human to
// look. This is intentionally narrow (deploy.mjs's job is shipping suite
// code, not general secret-scanning) — it only ever fires on an untracked
// path that matches one of these, which should never legitimately occur in
// these repos.
const SECRET_PATTERNS = [
  /(^|\/)\.env(\..*)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)id_rsa(\.pub)?$/i,
  /(^|\/)id_ed25519(\.pub)?$/i,
  /credentials.*\.(json|ya?ml)$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.pgpass$/i,
];

/**
 * Stage every change in `cwd` (modified, deleted, and new files — `git
 * add -A`) so a genuinely new file (a new script, a new asset) is never
 * silently left out, the way a narrower `git add -u` would miss it. Safe in
 * practice because each of these repos' own .gitignore already excludes the
 * one recurring source of stray local files (CodeGraph's data dir) even when
 * that .gitignore itself isn't committed — confirmed with `git add -A
 * --dry-run` before relying on it here. New files are printed for visibility
 * since nothing pauses for confirmation; anything secret-shaped aborts
 * instead of being committed blind.
 */
function stageAll(cwd, label) {
  const status = porcelain(cwd);
  if (!status) return { changed: false };
  const untracked = status
    .split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3));
  const suspicious = untracked.filter((p) => SECRET_PATTERNS.some((re) => re.test(p)));
  if (suspicious.length) {
    die(
      `${label}: refusing to auto-commit — untracked file(s) that look like secrets:\n` +
        suspicious.map((p) => '    ' + p).join('\n') +
        `\n  Review them yourself, then commit manually if they're actually safe to ship.`,
    );
  }
  if (untracked.length) {
    console.log(`  New file(s) in ${label}:`);
    untracked.forEach((p) => console.log('    ' + p));
  }
  run('git', ['add', '-A'], cwd);
  const staged = runCapture('git', ['diff', '--cached', '--name-only'], cwd).trim();
  return { changed: !!staged };
}

function main() {
  console.log('== yourlines suite deploy ==\n');

  // ---- 1) Commit + push the sub-app repo, if invoked from one -------------
  if (appName) {
    const app = APPS.find((a) => a.name === appName);
    if (!app) die(`Unknown app "${appName}". Known apps: ${APPS.map((a) => a.name).join(', ')}`);
    if (!existsSync(app.src)) die(`Could not find ${app.title} at ${app.src}`);

    const { changed } = stageAll(app.src, app.title);
    if (!changed) {
      console.log(`${app.title}: no changes to commit.`);
    } else {
      console.log(`Committing ${app.title}...`);
      run('git', ['commit', '-m', `chore: deploy ${app.title} update`], app.src);
      console.log(`Pushing ${app.title}...`);
      run('git', ['push'], app.src);
    }
    console.log('');
  }

  // ---- 2) Sync all sub-apps into public/ -----------------------------------
  console.log('Syncing sub-apps into the suite...');
  run('node', [join(repoRoot, 'scripts', 'sync-apps.mjs')], repoRoot);
  console.log('');

  // ---- 3) Anything to deploy? -----------------------------------------------
  const hubStatus = porcelain(repoRoot);
  if (!hubStatus) {
    console.log('Suite is already up to date — nothing to deploy.');
    return;
  }

  // ---- 4) Gate A: hub build (tsc + vite) ------------------------------------
  console.log('Building (safety gate: tsc + vite)...');
  try {
    runNpm(['run', 'build'], repoRoot);
  } catch {
    die('Build failed — see the error above. Nothing was committed or pushed; fix it and re-run.');
  }

  // ---- 5) Gate B: sub-app syntax check --------------------------------------
  // The sub-apps are copied into public/ verbatim and never touched by
  // tsc/Vite, so Gate A alone would let a broken index.html sail through.
  // Parse (without executing) every inline <script> block.
  console.log('\nChecking sub-app scripts (safety gate)...');
  const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  function isClassicScript(attrs) {
    if (/\bsrc\s*=/i.test(attrs)) return false; // external file — nothing inline to parse
    const m = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
    if (!m) return true; // no type attr => classic script
    const t = m[1].trim().toLowerCase();
    return t === '' || t === 'text/javascript' || t === 'application/javascript';
  }
  function checkInlineScripts(path) {
    const html = readFileSync(path, 'utf8');
    let m;
    let checked = 0;
    while ((m = SCRIPT_RE.exec(html))) {
      const [, attrs, code] = m;
      if (!isClassicScript(attrs) || !code.trim()) continue;
      checked++;
      try {
        new Function(code); // parses without executing
      } catch (e) {
        die(
          `Syntax error in ${path} (inline <script> block ${checked}): ${e.message}\n` +
            `Nothing was committed or pushed. Fix it in the app's own source repo, then re-run.`,
        );
      }
    }
    return checked;
  }
  // A sub-app's JavaScript is just as unchecked when it sits in its own file,
  // and for most of them that file is the whole app. `node --check` picks
  // script or module parsing off the extension, so anything that imports or
  // exports goes through a temporary .mjs copy — parsing a module as a script
  // fails on the very first line, and parsing a script as a module would fail
  // it for sloppy-mode constructs that are perfectly legal where it runs.
  const MODULE_RE = /^\s*(?:import|export)[\s({*'"]/m;
  function checkJsFile(path, label) {
    const code = readFileSync(path, 'utf8');
    let target = path;
    let tmp = null;
    if (MODULE_RE.test(code) && !path.endsWith('.mjs')) {
      tmp = join(tmpdir(), `suite-check-${randomUUID()}.mjs`);
      writeFileSync(tmp, code);
      target = tmp;
    }
    let ok = true;
    try {
      run('node', ['--check', target], repoRoot);
    } catch {
      ok = false;
    }
    if (tmp) rmSync(tmp, { force: true });
    if (!ok) die(`Syntax error in ${path}. Nothing was committed or pushed.`);
    console.log(`  ${label}: OK`);
  }
  for (const app of APPS) {
    const indexPath = join(repoRoot, 'public', app.name, 'index.html');
    if (!existsSync(indexPath)) continue;
    const n = checkInlineScripts(indexPath);
    console.log(`  ${app.title}: ${n} inline script block(s) OK`);
    for (const entry of app.include) {
      if (!entry.endsWith('.js')) continue;
      const path = join(repoRoot, 'public', app.name, entry);
      if (existsSync(path)) checkJsFile(path, `  ${app.title} ${entry}`);
    }
  }

  // ---- 6) Commit + push yourlines -------------------------------------------
  const changedApps = APPS.filter((a) => hubStatus.includes(`public/${a.name}/`)).map((a) => a.title);
  const message = changedApps.length ? `chore: sync ${changedApps.join(', ')} into the suite` : 'chore: update suite';

  console.log('\nCommitting + pushing yourlines...');
  const staged = stageAll(repoRoot, 'yourlines');
  if (!staged.changed) {
    // Git reports a file as modified when only its line endings differ from
    // what core.autocrlf wants in the working tree, which is exactly what a
    // sync of sources stored with LF leaves behind. Git itself sees no
    // change, so nothing stages and a commit would fail on an empty tree.
    // Having nothing to publish is not a failure.
    console.log('Nothing actually changed — the live suite is already current.');
    return;
  }
  run('git', ['commit', '-m', message], repoRoot);
  run('git', ['push'], repoRoot);

  console.log('\nDeployed. GitHub Actions will build and publish in about a minute:');
  console.log('  https://audiophrases.github.io/yourlines/');
  try {
    runCapture('gh', ['--version']);
    console.log('\n  Watch it with: gh run watch --repo audiophrases/yourlines');
  } catch {
    // gh not installed/authenticated — no hint, no harm.
  }
}

try {
  main();
} catch (e) {
  die(e && e.message ? e.message : String(e));
}
