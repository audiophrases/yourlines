// yourlines suite — floating app switcher, injected into every app in the
// suite. Self-contained (no dependencies, inline styles) so it can't clash
// with each app's own CSS/layout. Collapsible; remembers state per browser.
(function () {
  'use strict';
  if (document.getElementById('yl-suite-nav')) return;

  var APPS = [
    { id: 'lines', label: 'Lines', href: '/', icon: '♞' },
    { id: 'play', label: 'Play', href: '/play/', icon: '⚔' },
    { id: 'gym', label: 'Gym', href: '/gym/', icon: '🏋' },
    { id: 'review', label: 'Review', href: '/review/', icon: '🔎' },
  ];

  function currentApp() {
    var p = location.pathname;
    if (p.indexOf('/play/') === 0) return 'play';
    if (p.indexOf('/gym/') === 0) return 'gym';
    if (p.indexOf('/review/') === 0) return 'review';
    return 'lines';
  }

  var LS_KEY = 'yourlines:suite-nav';
  var collapsed = false;
  try {
    collapsed = localStorage.getItem(LS_KEY) === 'collapsed';
  } catch (e) {}

  var host = document.createElement('div');
  host.id = 'yl-suite-nav';
  host.style.cssText =
    'position:fixed;top:10px;right:10px;z-index:2147483000;display:flex;align-items:center;gap:2px;' +
    'background:rgba(15,17,23,0.92);border:1px solid #363c52;border-radius:999px;padding:3px;' +
    'font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 24px -8px rgba(0,0,0,0.6);' +
    'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);user-select:none;';

  var active = currentApp();

  function makeItem(app) {
    var a = document.createElement('a');
    a.href = app.href;
    a.textContent = app.icon + ' ' + app.label;
    a.title = app.label;
    var isActive = app.id === active;
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
  items.style.cssText = 'display:flex;align-items:center;gap:2px;';
  for (var i = 0; i < APPS.length; i++) items.appendChild(makeItem(APPS[i]));

  var toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Toggle suite navigation');
  toggle.style.cssText =
    'border:0;background:transparent;color:#6b7290;cursor:pointer;padding:5px 8px;border-radius:999px;font:inherit;';

  function render() {
    items.style.display = collapsed ? 'none' : 'flex';
    toggle.textContent = collapsed ? '♞' : '×';
    toggle.title = collapsed ? 'Open suite navigation' : 'Collapse';
    if (collapsed) {
      toggle.style.color = '#f2b544';
      toggle.style.fontSize = '15px';
    } else {
      toggle.style.color = '#6b7290';
      toggle.style.fontSize = '12px';
    }
  }

  toggle.onclick = function () {
    collapsed = !collapsed;
    try {
      localStorage.setItem(LS_KEY, collapsed ? 'collapsed' : 'open');
    } catch (e) {}
    render();
  };

  host.appendChild(items);
  host.appendChild(toggle);
  render();

  function mount() {
    if (document.body) document.body.appendChild(host);
    else document.addEventListener('DOMContentLoaded', mount);
  }
  mount();
})();
