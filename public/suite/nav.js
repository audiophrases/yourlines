// yourlines suite — floating app switcher, injected into every app in the
// suite. Self-contained (no dependencies, inline styles) so it can't clash
// with each app's own CSS/layout. Collapsible; remembers state per browser.
(function () {
  'use strict';
  if (document.getElementById('yl-suite-nav')) return;

  // This script is always loaded from '<suiteBase>suite/nav.js', so its own
  // src tells us the suite's root — '/' locally, '/yourlines/' on GitHub
  // Pages (or whatever else it's hosted under later) — with no build step
  // or hardcoding involved.
  var SUITE_BASE = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      var m = src && src.match(/^(.*\/)suite\/[^/]*$/);
      if (m) return new URL(m[1], location.href).pathname;
    } catch (e) {}
    return '/';
  })();

  var APPS = [
    { id: 'lines', label: 'Lines', href: SUITE_BASE, icon: '♞' },
    { id: 'play', label: 'Play', href: SUITE_BASE + 'play/', icon: '⚔' },
    { id: 'spar', label: 'Spar', href: SUITE_BASE + 'spar/', icon: '🥊' },
    { id: 'gym', label: 'Gym', href: SUITE_BASE + 'gym/', icon: '🏋' },
    { id: 'review', label: 'Review', href: SUITE_BASE + 'review/', icon: '🔎' },
    { id: 'puzzles', label: 'Puzzles', href: SUITE_BASE + 'puzzles/', icon: '🧩' },
  ];

  function currentApp() {
    var p = location.pathname;
    var rel = p.indexOf(SUITE_BASE) === 0 ? p.slice(SUITE_BASE.length) : p.replace(/^\//, '');
    if (rel.indexOf('play/') === 0) return 'play';
    if (rel.indexOf('spar/') === 0) return 'spar';
    if (rel.indexOf('gym/') === 0) return 'gym';
    if (rel.indexOf('review/') === 0) return 'review';
    if (rel.indexOf('puzzles/') === 0) return 'puzzles';
    return 'lines';
  }

  var LS_KEY = 'yourlines:suite-nav';
  var collapsed = false;
  try {
    collapsed = localStorage.getItem(LS_KEY) === 'collapsed';
  } catch (e) {}
  /* Shut because there is nowhere to open into is not the same thing as shut
     because you asked, so it is kept apart: never stored, and a tap on the
     toggle overrules it. */
  var squeezed = false;

  var host = document.createElement('div');
  host.id = 'yl-suite-nav';
  host.style.cssText =
    'position:fixed;top:10px;right:10px;z-index:2147483000;display:flex;align-items:center;gap:2px;' +
    'background:rgba(15,17,23,0.92);border:1px solid #363c52;border-radius:999px;padding:3px;' +
    'font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 24px -8px rgba(0,0,0,0.6);' +
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);user-select:none;' +
    'max-width:calc(100vw - 20px);';

  var active = currentApp();

  var START_FEN_PREFIX = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

  /** Carry the current board across apps: if the host app exposes
   *  window.SuiteBoardContext (() => {pgn?, fen?}), links open the target
   *  app preloaded with that position:
   *    Play  -> /play/?pgn|fen=   (analysis board at the position)
   *    Spar  -> /spar/?pgn|fen=   (carry on from it against the coach)
   *    Lines -> /?pgn|fen=        (how do MY games handle this?)
   *    Gym   -> /gym/?lookup=     (matching trainer lines)  */
  function hrefWithContext(app) {
    try {
      var ctx = typeof window.SuiteBoardContext === 'function' ? window.SuiteBoardContext() : null;
      if (!ctx) return app.href;
      var pgn = ctx.pgn && ctx.pgn.trim() ? ctx.pgn.trim() : '';
      var fen = ctx.fen && ctx.fen.trim() ? ctx.fen.trim() : '';
      if (fen.indexOf(START_FEN_PREFIX) === 0) fen = '';
      if (app.id === 'play') {
        if (pgn) return SUITE_BASE + 'play/?pgn=' + encodeURIComponent(pgn);
        if (fen) return SUITE_BASE + 'play/?fen=' + encodeURIComponent(fen);
      } else if (app.id === 'spar') {
        if (pgn) return SUITE_BASE + 'spar/?pgn=' + encodeURIComponent(pgn);
        if (fen) return SUITE_BASE + 'spar/?fen=' + encodeURIComponent(fen);
      } else if (app.id === 'lines') {
        if (pgn) return SUITE_BASE + '?pgn=' + encodeURIComponent(pgn);
        if (fen) return SUITE_BASE + '?fen=' + encodeURIComponent(fen);
      } else if (app.id === 'gym') {
        var q = pgn || fen;
        if (q) return SUITE_BASE + 'gym/?lookup=' + encodeURIComponent(q);
      }
    } catch (e) {}
    return app.href;
  }

  var CONTEXT_TITLES = {
    play: 'Open the analysis board with the current position',
    spar: 'Carry on from the current position against the sparring coach',
    lines: 'See how your own games handle the current position',
    gym: 'Find trainer lines matching the current position',
  };

  /** Open (or reuse) a fixed tab per suite app, so switching apps never
   *  navigates the tab you're leaving — whatever is running there (an
   *  in-progress engine analysis, unsaved input) survives untouched. Repeat
   *  visits to the same app reuse its tab instead of piling up duplicates. */
  function openSuiteTab(url, appId) {
    var win = null;
    try {
      win = window.open(url, 'yourlines-' + appId);
    } catch (e) {
      win = null;
    }
    if (win) {
      try {
        win.focus();
      } catch (e) {}
    } else {
      // Popup blocked (rare for a direct click response) — fall back to a
      // same-tab navigation rather than silently doing nothing.
      location.href = url;
    }
  }

  function makeItem(app) {
    var a = document.createElement('a');
    a.href = app.href;
    a.textContent = app.icon + ' ' + app.label;
    a.title = app.label;
    var isActive = app.id === active;
    if (!isActive) {
      a.title = CONTEXT_TITLES[app.id] || ('Open ' + app.label + ' in its own tab');
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openSuiteTab(hrefWithContext(app), app.id);
      });
    }
    a.style.cssText =
      'display:inline-block;padding:5px 10px;border-radius:999px;text-decoration:none;white-space:nowrap;' +
      (isActive
        ? 'background:rgba(242,181,68,0.18);color:#f2b544;font-weight:600;'
        : 'color:#aab2c8;');
    if (!isActive) {
      a.onmouseenter = function () {
        a.style.color = '#eef1f8';
        a.style.background = 'rgba(255,255,255,0.06)';
      };
      a.onmouseleave = function () {
        a.style.color = '#aab2c8';
        a.style.background = 'transparent';
      };
    }
    return a;
  }

  var items = document.createElement('div');
  items.style.cssText = 'display:flex;align-items:center;gap:2px;flex-wrap:wrap;justify-content:flex-end;';
  for (var i = 0; i < APPS.length; i++) items.appendChild(makeItem(APPS[i]));

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Toggle suite navigation');
  toggle.style.cssText =
    'border:0;background:transparent;color:#6b7290;cursor:pointer;padding:5px 8px;border-radius:999px;font:inherit;';

  function shut() {
    return collapsed || squeezed;
  }

  function render() {
    var closed = shut();
    items.style.display = closed ? 'none' : 'flex';
    toggle.textContent = closed ? '♞' : '×';
    toggle.title = closed ? 'Open suite navigation' : 'Collapse';
    if (closed) {
      toggle.style.color = '#f2b544';
      toggle.style.fontSize = '15px';
    } else {
      toggle.style.color = '#6b7290';
      toggle.style.fontSize = '12px';
    }
  }

  toggle.onclick = function () {
    collapsed = !shut();
    squeezed = false;          // asking outranks anything measured
    try {
      localStorage.setItem(LS_KEY, collapsed ? 'collapsed' : 'open');
    } catch (e) {}
    render();
  };

  host.appendChild(items);
  host.appendChild(toggle);
  render();

  /* ---- staying out of the host app's way ----
     The pill is fixed to the top-right corner, which is exactly where several
     of these apps keep something of their own: ChessGym's admin drawer, and
     the sign-in button in the Puzzles and Sparring Coach headers. Which app
     puts what there is a fact about the app rather than about the switcher —
     but the switcher is the guest here, so it does the adapting and the apps
     carry nothing about it.

     A drawer that is fixed, resizable and collapsible is followed as it
     changes. A header that simply scrolls away with the page is measured and
     parked to the left of, with no scroll listener: scrolling moves it up and
     down, and all the pill needs to know is where its left edge is. */
  var HOST_CHROME = {
    gym: '.admin-panel',
    puzzles: 'header .acct',
    spar: 'header .acct',
  };

  var GAP = 10;
  var MIN_ROOM = 46;    // the collapsed pill's own width, and never less
  var TOGGLE = 34;      // and what the toggle beside the row takes up

  /* A pill is one row. Rather than guess at the width where that stops being
     possible, ask: laid out with no wrapping and free to be as wide as it
     likes, this is what the row wants. It cannot change afterwards — the six
     apps are fixed — so it is measured once and kept. */
  var rowWidth = 0;
  function wantsWidth() {
    if (rowWidth) return rowWidth;
    var display = items.style.display, wrap = items.style.flexWrap, width = items.style.width;
    items.style.display = 'flex';
    items.style.flexWrap = 'nowrap';
    items.style.width = 'max-content';
    rowWidth = Math.ceil(items.getBoundingClientRect().width);
    items.style.display = display;
    items.style.flexWrap = wrap;
    items.style.width = width;
    return rowWidth;
  }

  /* Sizing and placing the pill: clear of whatever the app keeps in the
     corner, clear of the edge of the screen, and folded away when the row
     will not fit. Every app runs this — the ones with nothing to dodge still
     have a screen width to fit inside. */
  function keepClear() {
    var selector = HOST_CHROME[active];
    var chrome = selector ? document.querySelector(selector) : null;
    // Called again once the host app has finished building itself, by which
    // time its corner may have moved: measure again rather than bail out.
    if (host.__reposition) return host.__reposition();
    var fixed = !!chrome && getComputedStyle(chrome).position === 'fixed';

    var reposition = function () {
      var right = GAP;
      if (chrome) {
        var rect = chrome.getBoundingClientRect();
        var shown = rect.width > 0 && rect.height > 0 && getComputedStyle(chrome).display !== 'none';
        // Measured where it sits with the page scrolled to the top, which is
        // the only place the pill can actually run into it.
        var top = fixed ? rect.top : rect.top + (window.scrollY || 0);
        var mine = host.getBoundingClientRect();
        if (shown && top < mine.bottom && top + rect.height > mine.top) {
          right = Math.max(GAP, window.innerWidth - rect.left + GAP);
        }
      }
      // However little is left over, the pill keeps enough to be its own
      // handle: squeezed past this it would be neither readable nor tappable,
      // which is worse than sitting on the corner of something.
      right = Math.min(right, Math.max(GAP, window.innerWidth - MIN_ROOM - GAP));
      var room = window.innerWidth - right - GAP;
      host.style.right = right + 'px';
      host.style.maxWidth = room + 'px';
      // A pill is one row. Where the row will not go on one, it folds away
      // rather than stacking itself over the header it just moved out of —
      // the toggle is the way back, and asking that way clears this.
      squeezed = room < wantsWidth() + TOGGLE + GAP;
      render();
      /* A fixed offset is resolved against the nearest ancestor carrying a
         transform or a containment, which is not always the viewport — a
         couple of these apps grow one at phone widths. So the offset asked
         for is not always the offset given: measure what landed and correct
         for the difference, once, with the row already laid out again. */
      var landed = host.getBoundingClientRect();
      var drift = landed.right - (window.innerWidth - right);
      if (Math.abs(drift) > 1) host.style.right = right + drift + 'px';
    };

    host.__reposition = reposition;
    reposition();
    window.addEventListener('resize', reposition);
    if (!chrome) return;
    if (typeof ResizeObserver === 'function') new ResizeObserver(reposition).observe(chrome);
    if (fixed) {
      new MutationObserver(reposition).observe(chrome, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
    }
  }

  /* ---- and getting out of the way altogether ----
     An app that hands the board the whole screen has said what it wants the
     screen for, and a pill floating over the corner of it is the one thing
     nobody asked for. The browser's own fullscreen counts wherever it is
     used; an app that clears its own chrome without going native says so
     with a class, and is watched for it. */
  var HOST_IMMERSIVE = {
    spar: 'body.focus',
  };

  function immersive() {
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    var selector = HOST_IMMERSIVE[active];
    return !!(selector && document.querySelector(selector));
  }

  function syncVisibility() {
    host.style.display = immersive() ? 'none' : 'flex';
  }

  function mount() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', mount);
      return;
    }
    document.body.appendChild(host);
    // Host apps may build their UI after load — look again shortly.
    keepClear();
    setTimeout(keepClear, 1000);
    syncVisibility();
    document.addEventListener('fullscreenchange', syncVisibility);
    document.addEventListener('webkitfullscreenchange', syncVisibility);
    if (HOST_IMMERSIVE[active]) {
      new MutationObserver(syncVisibility).observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }
  mount();
})();
