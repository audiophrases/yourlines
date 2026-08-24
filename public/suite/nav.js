// yourlines suite — the shared app bar, carried by every app in the suite.
//
// A full-width strip across the top of the window, above whatever the app
// puts at the top of itself. It used to be a pill floating over the top-right
// corner, which is where several of these apps keep something of their own, so
// it spent its time dodging them; a bar with room of its own has nothing to
// dodge. It also gives every app the same full-screen control, and takes
// itself off the screen while that is on.
//
// It is pinned rather than laid out in the page, and the room it takes is
// given back as padding on the document element. Putting it in the flow means
// putting it inside the app's own body, and two of these apps make that body
// a flex container: dropped into the Chess Interface, which centres a flex
// row, the bar became a column and pushed the board off the side of the
// window. <html> is out of reach of whatever the body is doing.
//
// Self-contained — no dependencies, inline styles — so it cannot clash with
// each app's own CSS.
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

  // ---- the bar ---------------------------------------------------------
  var bar = document.createElement('nav');
  bar.id = 'yl-suite-nav';
  bar.setAttribute('aria-label', 'Chess suite');
  bar.style.cssText =
    'position:fixed;top:0;left:0;right:0;width:100%;box-sizing:border-box;z-index:2147483000;' +
    'display:flex;align-items:center;gap:2px;' +
    'padding:6px 10px;background:#0f1117;border-bottom:1px solid #262b3d;' +
    'font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
    'user-select:none;overflow:hidden;';

  var links = [];

  function makeItem(app) {
    var a = document.createElement('a');
    a.href = app.href;
    a.setAttribute('data-app', app.id);
    var isActive = app.id === active;
    a.title = isActive ? app.label : CONTEXT_TITLES[app.id] || 'Open ' + app.label;
    var icon = document.createElement('span');
    icon.textContent = app.icon;
    icon.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    text.textContent = app.label;
    a.appendChild(icon);
    a.appendChild(text);
    a.style.cssText =
      'display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;flex:0 0 auto;' +
      'text-decoration:none;white-space:nowrap;' +
      (isActive ? 'background:rgba(242,181,68,0.18);color:#f2b544;font-weight:600;' : 'color:#aab2c8;');
    if (!isActive) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        openSuiteTab(hrefWithContext(app), app.id);
      });
      a.onmouseenter = function () {
        a.style.color = '#eef1f8';
        a.style.background = 'rgba(255,255,255,0.06)';
      };
      a.onmouseleave = function () {
        a.style.color = '#aab2c8';
        a.style.background = 'transparent';
      };
    }
    links.push({ el: a, text: text });
    return a;
  }

  for (var i = 0; i < APPS.length; i++) bar.appendChild(makeItem(APPS[i]));

  // ---- full screen, for every app --------------------------------------
  var full = document.createElement('button');
  full.type = 'button';
  full.textContent = '⛶';
  full.title = 'Full screen — give the board the whole window (Esc to come back)';
  full.setAttribute('aria-label', 'Full screen');
  full.style.cssText =
    'margin-left:auto;border:0;background:transparent;color:#6b7290;cursor:pointer;' +
    'padding:5px 9px;border-radius:7px;font:inherit;font-size:15px;line-height:1;flex:0 0 auto;';
  full.onmouseenter = function () {
    full.style.color = '#eef1f8';
    full.style.background = 'rgba(255,255,255,0.06)';
  };
  full.onmouseleave = function () {
    full.style.color = '#6b7290';
    full.style.background = 'transparent';
  };
  bar.appendChild(full);

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  full.onclick = function () {
    try {
      if (fullscreenElement()) {
        var exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document);
        return;
      }
      var el = document.documentElement;
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      // The promise rejects when the browser refuses (an iframe without the
      // permission, a policy) — nothing to do but not crash on it.
      if (req) {
        var r = req.call(el);
        if (r && r.catch) r.catch(function () {});
      }
    } catch (e) {}
  };

  /* An app that clears its own chrome without going native says so with a
     class, and the bar goes for that too — the Sparring Coach falls back to
     one when the browser refuses fullscreen. */
  var HOST_IMMERSIVE = {
    spar: 'body.focus',
  };

  function immersive() {
    if (fullscreenElement()) return true;
    var selector = HOST_IMMERSIVE[active];
    return !!(selector && document.querySelector(selector));
  }

  function syncFullscreen() {
    bar.style.display = immersive() ? 'none' : 'flex';
  }

  /* The room the bar takes, given back above the app so nothing of it ends
     up underneath. On <html> rather than <body>, which the app may well have
     made a flex container — see the note at the top. Measured rather than
     assumed, since the bar is a row of text and its height follows whatever
     the browser makes of that. */
  function reserveRoom() {
    var h = immersive() ? 0 : Math.round(bar.getBoundingClientRect().height);
    document.documentElement.style.paddingTop = h + 'px';
  }

  /* Six labels do not fit across a phone, and there is no folding this away
     to make them — so the labels go and the icons stay, which fits anywhere
     and keeps every app one tap from every other. Each link keeps its title,
     so the name is still there to be read. */
  function fitLabels() {
    var i;
    for (i = 0; i < links.length; i++) links[i].text.style.display = '';
    if (bar.scrollWidth <= bar.clientWidth) return;
    for (i = 0; i < links.length; i++) links[i].text.style.display = 'none';
  }

  function relayout() {
    /* The width of the window, which is not always the width the bar would
       inherit: an app that reserves a stable scrollbar gutter makes the
       containing block narrower than the window, and a bar stopping short of
       the edge reads as a bug rather than as a gutter. Set before the labels
       are fitted, since they are measured against it. */
    bar.style.width = document.documentElement.clientWidth + 'px';
    fitLabels();
    reserveRoom();
    shimHost();
  }

  /* A panel pinned to the top of the viewport does not know the bar is there
     and would sit over it — ChessGym's admin drawer is one. Nudging it down
     is a fact about that app, so it lives here with everything else the
     switcher knows about its hosts, and the apps carry nothing about it. */
  var HOST_SHIMS = {
    gym: '.admin-panel { top: %Hpx; }',
  };
  var shimStyle = null;

  function shimHost() {
    var rule = HOST_SHIMS[active];
    if (!rule) return;
    if (!shimStyle) {
      shimStyle = document.createElement('style');
      document.head.appendChild(shimStyle);
    }
    var h = immersive() ? 0 : Math.round(bar.getBoundingClientRect().height);
    shimStyle.textContent = rule.replace('%H', h);
  }

  function mount() {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', mount);
      return;
    }
    document.body.insertBefore(bar, document.body.firstChild);
    syncFullscreen();
    relayout();
    window.addEventListener('resize', relayout);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    if (HOST_IMMERSIVE[active]) {
      new MutationObserver(onFullscreenChange).observe(document.body, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    // Host apps may still be building themselves — check the fit again once
    // whatever they do to the body has settled.
    setTimeout(relayout, 1000);
  }

  function onFullscreenChange() {
    syncFullscreen();
    relayout();
    /* Apps that size themselves off the window need to hear about the room
       the bar just took or gave back; every one of them listens for a
       resize, and the browser does not send one for this. */
    try {
      window.dispatchEvent(new Event('resize'));
    } catch (e) {}
  }

  mount();
})();
