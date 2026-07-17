// yourlines suite — shared-profiles bridge.
//
// Because every app in the suite is served from one origin, this script can
// read the profiles/games the user imported in Lines (IndexedDB db "yourlines")
// and offer them to the vanilla sub-apps:
//
//   • exposes window.YourlinesSuite = { listProfiles, getGames, getActiveProfile,
//     gameToPgn, takeHandoff } for any app to use
//   • /review/ : injects a "From Lines" game picker that fills the PGN input,
//     and auto-loads a game handed off from Lines ("Review this game")
//   • /gym/    : prefills the Lookup modal's username/site from the active profile
//
// Handoff protocol: Lines writes localStorage["yourlines:handoff:<app>"] =
// JSON {pgn, player, ts} then navigates; the target app's bridge consumes it.
(function () {
  'use strict';

  // ── IndexedDB access (read-only, tolerant of the db not existing yet) ──
  function openDb() {
    return new Promise(function (resolve) {
      var req = indexedDB.open('yourlines');
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        resolve(null);
      };
    });
  }

  function getAll(db, store) {
    return new Promise(function (resolve) {
      if (!db || !db.objectStoreNames.contains(store)) return resolve([]);
      var r = db.transaction(store, 'readonly').objectStore(store).getAll();
      r.onsuccess = function () {
        resolve(r.result || []);
      };
      r.onerror = function () {
        resolve([]);
      };
    });
  }

  function getOne(db, store, key) {
    return new Promise(function (resolve) {
      if (!db || !db.objectStoreNames.contains(store)) return resolve(undefined);
      var r = db.transaction(store, 'readonly').objectStore(store).get(key);
      r.onsuccess = function () {
        resolve(r.result);
      };
      r.onerror = function () {
        resolve(undefined);
      };
    });
  }

  function listProfiles() {
    return openDb().then(function (db) {
      return getAll(db, 'meta').then(function (list) {
        list.sort(function (a, b) {
          return (b.savedAt || 0) - (a.savedAt || 0);
        });
        return list;
      });
    });
  }

  function getGames(key) {
    return openDb().then(function (db) {
      return getOne(db, 'games', key).then(function (g) {
        return g || [];
      });
    });
  }

  function getActiveProfile() {
    return openDb().then(function (db) {
      return getOne(db, 'settings', 'lastActive').then(function (key) {
        return listProfiles().then(function (profiles) {
          if (!profiles.length) return null;
          var meta =
            profiles.filter(function (p) {
              return p.key === key;
            })[0] || profiles[0];
          return getGames(meta.key).then(function (games) {
            meta = Object.assign({}, meta);
            meta.games = games;
            return meta;
          });
        });
      });
    });
  }

  // ── Game -> PGN ──────────────────────────────────────────────────────
  function pgnDate(iso) {
    if (!iso) return '????.??.??';
    var d = new Date(iso);
    if (isNaN(d)) return '????.??.??';
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '.' + mm + '.' + dd;
  }

  function gameToPgn(game, username) {
    var user = username || 'me';
    var opp = game.opponent || 'opponent';
    var white = game.userColor === 'white' ? user : opp;
    var black = game.userColor === 'white' ? opp : user;
    var result =
      game.result === 'draw'
        ? '1/2-1/2'
        : (game.result === 'win') === (game.userColor === 'white')
          ? '1-0'
          : '0-1';
    var headers =
      '[Event "' + (game.site === 'lichess' ? 'Lichess' : 'Chess.com') + ' game"]\n' +
      (game.url ? '[Site "' + game.url + '"]\n' : '') +
      '[Date "' + pgnDate(game.date) + '"]\n' +
      '[White "' + white + '"]\n' +
      '[Black "' + black + '"]\n' +
      '[Result "' + result + '"]\n';
    var body = '';
    for (var i = 0; i < game.moves.length; i++) {
      if (i % 2 === 0) body += (i / 2 + 1) + '. ';
      body += game.moves[i] + ' ';
    }
    return headers + '\n' + body.trim() + ' ' + result + '\n';
  }

  // ── Handoff ──────────────────────────────────────────────────────────
  function takeHandoff(app) {
    try {
      var raw = localStorage.getItem('yourlines:handoff:' + app);
      if (!raw) return null;
      localStorage.removeItem('yourlines:handoff:' + app);
      var data = JSON.parse(raw);
      if (!data.ts || Date.now() - data.ts > 5 * 60 * 1000) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  window.YourlinesSuite = {
    listProfiles: listProfiles,
    getGames: getGames,
    getActiveProfile: getActiveProfile,
    gameToPgn: gameToPgn,
    takeHandoff: takeHandoff,
  };

  // ── DOM helpers ──────────────────────────────────────────────────────
  function setValue(el, value) {
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function flash(el) {
    if (!el) return;
    var old = el.style.boxShadow;
    el.style.boxShadow = '0 0 0 2px #f2b544';
    setTimeout(function () {
      el.style.boxShadow = old;
    }, 1200);
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  var path = location.pathname;

  // ── /review/ integration ─────────────────────────────────────────────
  function isVisible(el) {
    return !!el && el.offsetParent !== null;
  }

  /** The Reviewer is a step wizard and may sit past step 1 (it auto-loads a
   *  recent game on startup). Go back to step 1 first if needed. */
  function ensureStep1(done) {
    var step1 = document.getElementById('step1-section');
    if (!step1 || isVisible(step1)) return done(true);
    var back = document.getElementById('back-to-step1-btn');
    if (back) back.click();
    setTimeout(function () {
      var s = document.getElementById('step1-section');
      done(!s || isVisible(s));
    }, 350);
  }

  function reviewFill(pgn, player, thenAnalyze) {
    ensureStep1(function () {
      var pgnInput = document.getElementById('pgn-input');
      var nameInput = document.getElementById('player-name-input');
      if (!pgnInput) return;
      setValue(pgnInput, pgn);
      if (player && nameInput) setValue(nameInput, player);
      flash(pgnInput);
      pgnInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (thenAnalyze) {
        setTimeout(function () {
          var analyze = document.getElementById('analyze-pgn-btn');
          if (analyze && !analyze.disabled && isVisible(analyze)) analyze.click();
        }, 300);
      }
    });
  }

  function reviewPicker() {
    if (document.getElementById('yl-bridge-panel')) {
      document.getElementById('yl-bridge-panel').remove();
      return;
    }
    var panel = document.createElement('div');
    panel.id = 'yl-bridge-panel';
    panel.style.cssText =
      'position:fixed;top:92px;right:10px;z-index:2147483000;width:340px;max-height:70vh;display:flex;flex-direction:column;' +
      'background:#0f1117;border:1px solid #363c52;border-radius:12px;box-shadow:0 16px 48px -12px rgba(0,0,0,0.8);' +
      'font:12px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#d6dbe8;overflow:hidden;';
    panel.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #262b3d;">' +
      '<strong style="color:#eef1f8;">♞ Your games</strong>' +
      '<select id="yl-bridge-profile" style="flex:1;background:#1a1e2b;color:#d6dbe8;border:1px solid #363c52;border-radius:6px;padding:4px 6px;font:inherit;"></select>' +
      '<button id="yl-bridge-close" style="border:0;background:transparent;color:#6b7290;cursor:pointer;font-size:14px;">✕</button>' +
      '</div>' +
      '<div id="yl-bridge-list" style="overflow-y:auto;padding:4px;"></div>';
    document.body.appendChild(panel);
    panel.querySelector('#yl-bridge-close').onclick = function () {
      panel.remove();
    };

    var select = panel.querySelector('#yl-bridge-profile');
    var list = panel.querySelector('#yl-bridge-list');

    function renderGames(profile) {
      getGames(profile.key).then(function (games) {
        list.innerHTML = '';
        var sorted = games.slice().sort(function (a, b) {
          return (b.date || '').localeCompare(a.date || '');
        });
        if (!sorted.length) {
          list.innerHTML =
            '<p style="padding:16px;text-align:center;color:#6b7290;">No games cached. Import in <a href="/" style="color:#f2b544;">Lines</a> first.</p>';
          return;
        }
        sorted.slice(0, 100).forEach(function (g) {
          var row = document.createElement('button');
          row.type = 'button';
          var resColor = g.result === 'win' ? '#57c98a' : g.result === 'loss' ? '#f2668b' : '#6b7290';
          row.style.cssText =
            'display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:7px 9px;border:0;' +
            'background:transparent;color:#d6dbe8;cursor:pointer;border-radius:8px;font:inherit;';
          row.onmouseenter = function () {
            row.style.background = '#1a1e2b';
          };
          row.onmouseleave = function () {
            row.style.background = 'transparent';
          };
          row.innerHTML =
            '<span style="width:10px;height:10px;border-radius:50%;flex:none;border:1px solid #4a5169;background:' +
            (g.userColor === 'white' ? '#eef1f8' : '#0a0b10') +
            ';" title="You played ' + g.userColor + '"></span>' +
            '<span style="color:' + resColor + ';font-weight:700;width:14px;flex:none;">' +
            (g.result === 'win' ? 'W' : g.result === 'loss' ? 'L' : 'D') +
            '</span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">vs ' +
            (g.opponent || '?') +
            '</span>' +
            '<span style="color:#6b7290;flex:none;">' +
            (g.timeClass || '') + ' · ' + (g.date ? g.date.slice(0, 10) : '') +
            '</span>';
          row.onclick = function () {
            reviewFill(gameToPgn(g, profile.username), profile.username, false);
            panel.remove();
          };
          list.appendChild(row);
        });
      });
    }

    listProfiles().then(function (profiles) {
      if (!profiles.length) {
        list.innerHTML =
          '<p style="padding:16px;text-align:center;color:#6b7290;">No accounts yet. Import your games in <a href="/" style="color:#f2b544;">Lines</a> first.</p>';
        return;
      }
      profiles.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.key;
        opt.textContent = p.site + '/' + p.username + ' (' + p.gameCount + ')';
        select.appendChild(opt);
      });
      select.onchange = function () {
        var p = profiles.filter(function (x) {
          return x.key === select.value;
        })[0];
        if (p) renderGames(p);
      };
      renderGames(profiles[0]);
    });
  }

  function initReview() {
    // "From Lines" button next to the app's own load buttons (step 1)…
    var anchor = document.getElementById('load-chesscom-btn');
    if (anchor && anchor.parentElement && !document.getElementById('yl-bridge-btn')) {
      var btn = document.createElement('button');
      btn.id = 'yl-bridge-btn';
      btn.type = 'button';
      btn.className = anchor.className;
      btn.style.background = 'rgba(242,181,68,0.16)';
      btn.style.color = '#f2b544';
      btn.textContent = '♞ From Lines';
      btn.onclick = reviewPicker;
      anchor.parentElement.insertBefore(btn, anchor);
    }
    // …plus an always-visible floating chip, since the wizard hides step 1.
    if (!document.getElementById('yl-bridge-chip')) {
      var chip = document.createElement('button');
      chip.id = 'yl-bridge-chip';
      chip.type = 'button';
      chip.textContent = '♞ Your games';
      chip.style.cssText =
        'position:fixed;top:52px;right:10px;z-index:2147483000;border:1px solid rgba(242,181,68,0.4);' +
        'background:rgba(15,17,23,0.92);color:#f2b544;border-radius:999px;padding:6px 12px;cursor:pointer;' +
        'font:600 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 8px 24px -8px rgba(0,0,0,0.6);';
      chip.onclick = reviewPicker;
      document.body.appendChild(chip);
    }
    // Handoff from Lines ("Review this game") — wait for the app to boot.
    var h = takeHandoff('review');
    if (h && h.pgn) {
      var attempt = 0;
      var tryFill = function () {
        if (document.getElementById('pgn-input')) {
          reviewFill(h.pgn, h.player, true);
        } else if (attempt++ < 20) {
          setTimeout(tryFill, 250);
        }
      };
      setTimeout(tryFill, 500);
    }
  }

  // ── /gym/ integration ────────────────────────────────────────────────
  function initGym() {
    document.addEventListener(
      'click',
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        if (!t.closest('#lookupBtn')) return;
        setTimeout(function () {
          var input = document.getElementById('lookupUsername');
          var site = document.getElementById('lookupSite');
          if (!input || input.value) return; // don't stomp anything the user typed
          getActiveProfile().then(function (p) {
            if (!p) return;
            setValue(input, p.username);
            if (site) setValue(site, p.site === 'lichess' ? 'lichess' : 'chesscom');
            flash(input);
          });
        }, 150);
      },
      true,
    );
  }

  onReady(function () {
    if (path.indexOf('/review/') === 0) initReview();
    else if (path.indexOf('/gym/') === 0) initGym();
  });
})();
