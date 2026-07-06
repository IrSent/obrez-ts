// ── SETTINGS UI ──
// Loaded via DOMContentLoaded after settings-early.js has been running.
(function() {
  var errors = window.__obrezErrors || [];
  window.__obrezErrors = errors; // make sure mutations go to the same array

  var parts = window.location.pathname.split('/').filter(Boolean);
  var base = '/' + parts[0] + '/';
  var currentVersion = parts[parts.length - 1] || 'master';

  // ── styles ──
  var style = document.createElement('style');
  style.textContent = `
    #obrez-gear {
      position: fixed; top: -36px; right: -36px;
      width: 72px; height: 72px;
      z-index: 9999; cursor: pointer;
      transition: transform 0.35s cubic-bezier(.4,0,.2,1), filter 0.35s ease;
      filter: drop-shadow(0 0 0px transparent);
      opacity: 0.25; color: #fff;
    }
    #obrez-gear:hover {
      transform: translate(-20px, 20px);
      filter: drop-shadow(0 0 12px rgba(255,255,255,0.35));
      opacity: 1;
    }
    #obrez-gear svg {
      width: 100%; height: 100%;
      animation: obrez-spin 12s linear infinite;
      transform-origin: center;
    }
    @keyframes obrez-spin { to { transform: rotate(360deg); } }
    #obrez-modal-overlay {
      display: none; position: fixed; inset: 0;
      background: rgba(0,0,0,0.6); z-index: 10000;
      align-items: center; justify-content: center;
    }
    #obrez-modal-overlay.open { display: flex; }
    #obrez-modal {
      background: #1f1f23; border: 1px solid #333;
      border-radius: 12px; padding: 24px 32px;
      min-width: 320px; box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    #obrez-modal h2 { color: #eee; font-size: 18px; margin-bottom: 16px; }
    #obrez-modal .version-list {
      list-style: none; display: flex; flex-direction: column; gap: 8px;
    }
    #obrez-modal .version-item {
      display: flex; align-items: center; gap: 10px;
      color: #ccc; font-size: 14px; cursor: pointer;
      padding: 8px 12px; border-radius: 6px; transition: background 0.15s;
    }
    #obrez-modal .version-item:hover { background: #2a2a30; }
    #obrez-modal .version-item.active { background: #2a2a30; color: #fff; }
    #obrez-modal .version-item .radio {
      width: 16px; height: 16px;
      border: 2px solid #555; border-radius: 50%;
      flex-shrink: 0; display: flex;
      align-items: center; justify-content: center;
      transition: border-color 0.15s;
    }
    #obrez-modal .version-item.active .radio { border-color: #6c8cff; }
    #obrez-modal .version-item.active .radio::after {
      content: ''; width: 8px; height: 8px;
      background: #6c8cff; border-radius: 50%;
    }
    #obrez-modal .close-btn {
      margin-top: 16px; width: 100%; padding: 8px;
      background: #333; color: #ccc;
      border: 1px solid #444; border-radius: 6px;
      cursor: pointer; font-size: 14px; transition: background 0.15s;
    }
    #obrez-modal .close-btn:hover { background: #444; }
    #obrez-modal .version-label { font-weight: 600; }
    #obrez-debug-btn {
      position: fixed; bottom: 16px; right: 16px;
      width: 48px; height: 48px;
      background: #1a1a1a; color: #ff4444;
      border: 2px solid #ff4444; border-radius: 12px;
      font-size: 22px; line-height: 44px;
      text-align: center; cursor: pointer;
      z-index: 9999; user-select: none;
      box-shadow: 0 2px 12px rgba(255,68,68,0.4);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    #obrez-debug-btn.has-errors {
      animation: obrez-pulse 2s ease-in-out infinite;
    }
    @keyframes obrez-pulse {
      0%, 100% { box-shadow: 0 2px 12px rgba(255,68,68,0.4); }
      50%      { box-shadow: 0 2px 24px rgba(255,68,68,0.8); }
    }
    #obrez-debug-badge {
      position: absolute; top: -6px; right: -6px;
      min-width: 20px; height: 20px;
      background: #ff2222; color: #fff;
      font-size: 11px; font-weight: 700;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      padding: 0 5px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.5);
      font-family: system-ui, -apple-system, sans-serif;
    }
    #obrez-debug-tooltip {
      display: none;
      position: fixed; bottom: 74px; right: 12px;
      background: #1a1a1f; color: #e55;
      border: 1px solid #555; border-radius: 12px;
      padding: 14px 16px;
      width: calc(100vw - 24px);
      max-width: 500px;
      font-size: 12px; font-family: 'SF Mono', Menlo, Consolas, monospace;
      white-space: pre-wrap; word-break: break-all;
      max-height: 60vh; overflow-y: auto;
      z-index: 9999; box-shadow: 0 12px 40px rgba(0,0,0,0.7);
    }
    #obrez-debug-tooltip.open { display: block; }
    #obrez-debug-tooltip .err-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #333;
    }
    #obrez-debug-tooltip .err-header span { font-weight: 700; color: #ff6b6b; }
    #obrez-debug-tooltip .err-clear {
      font-size: 10px; color: #888; cursor: pointer;
      background: none; border: none; padding: 4px 8px;
      border-radius: 4px;
    }
    #obrez-debug-tooltip .err-clear:hover { background: #333; color: #ccc; }
    #obrez-debug-tooltip .err-row {
      padding: 8px 0; border-bottom: 1px solid #2a2a2f;
      cursor: pointer; transition: background 0.1s;
    }
    #obrez-debug-tooltip .err-row:last-child { border-bottom: none; }
    #obrez-debug-tooltip .err-row:active { background: #2a2a30; }
    #obrez-debug-tooltip .err-label {
      color: #ff6b6b; font-weight: 600; font-size: 11px;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    #obrez-debug-tooltip .err-source {
      color: #6c8cff; font-size: 11px; margin-top: 2px;
    }
    #obrez-debug-tooltip .err-msg {
      color: #ddd; margin-top: 3px; font-size: 12px;
    }
    #obrez-debug-tooltip .err-stack {
      margin-top: 3px; color: #888; font-size: 11px;
    }
    #obrez-debug-tooltip .err-stack-line {
      padding-left: 8px; border-left: 2px solid #333; margin-top: 1px;
    }
  `;
  document.head.appendChild(style);

  // ── gear button ──
  var gear = document.createElement('div');
  gear.id = 'obrez-gear';
  gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';
  document.body.appendChild(gear);

  // ── modal ──
  var overlay = document.createElement('div');
  overlay.id = 'obrez-modal-overlay';
  overlay.innerHTML = '<div id="obrez-modal"><h2>⚙ Настройки</h2><div class="version-list" id="obrez-version-list"></div><button class="close-btn" id="obrez-close-modal">Закрыть</button></div>';
  document.body.appendChild(overlay);

  fetch(base + 'stable-versions.json')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var list = document.getElementById('obrez-version-list');
      data.versions.forEach(function(v) {
        var item = document.createElement('div');
        item.className = 'version-item' + (v === currentVersion ? ' active' : '');
        item.innerHTML = '<span class="radio"></span><span class="version-label">' + v + '</span>';
        item.addEventListener('click', function() {
          localStorage.setItem('obrez-version', v);
          window.location.replace(base + v + '/');
        });
        list.appendChild(item);
      });
    }).catch(function() {});

  document.getElementById('obrez-close-modal').addEventListener('click', function() { overlay.classList.remove('open'); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.classList.remove('open'); });
  gear.addEventListener('click', function() { overlay.classList.add('open'); });

  // ── debug button ──
  var tooltipOpen = false;

  var debugBtn = document.createElement('div');
  debugBtn.id = 'obrez-debug-btn';
  debugBtn.textContent = '🐛';
  debugBtn.title = 'View errors';
  document.body.appendChild(debugBtn);

  var badge = document.createElement('div');
  badge.id = 'obrez-debug-badge';
  badge.style.display = 'none';
  debugBtn.appendChild(badge);

  var tooltip = document.createElement('div');
  tooltip.id = 'obrez-debug-tooltip';
  document.body.appendChild(tooltip);

  function updateBadge() {
    if (errors.length > 0) {
      badge.textContent = errors.length > 99 ? '99+' : errors.length;
      badge.style.display = 'flex';
      debugBtn.classList.add('has-errors');
    } else {
      badge.style.display = 'none';
      debugBtn.classList.remove('has-errors');
    }
  }

  function renderErrors() {
    tooltip.innerHTML = '';

    var header = document.createElement('div');
    header.className = 'err-header';
    var title = document.createElement('span');
    title.textContent = errors.length === 0 ? '✓ No errors' : '⚠ ' + errors.length + ' error' + (errors.length > 1 ? 's' : '');
    header.appendChild(title);

    if (errors.length > 0) {
      var clearBtn = document.createElement('button');
      clearBtn.className = 'err-clear';
      clearBtn.textContent = 'Clear all';
      clearBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        errors.length = 0;
        updateBadge();
        renderErrors();
      });
      header.appendChild(clearBtn);
    }
    tooltip.appendChild(header);

    if (errors.length === 0) {
      setTimeout(function() { tooltip.classList.remove('open'); }, 1200);
      return;
    }

    errors.slice().reverse().forEach(function(err) {
      var row = document.createElement('div');
      row.className = 'err-row';

      var html = '<div class="err-label">[' + err.time + '] ' + err.label + '</div>';
      if (err.source) html += '<div class="err-source">📍 ' + err.source + '</div>';
      if (err.msg) html += '<div class="err-msg">' + err.msg + '</div>';
      if (err.frames && err.frames.length) {
        html += '<div class="err-stack">';
        err.frames.forEach(function(f) { html += '<div class="err-stack-line">at ' + f + '</div>'; });
        html += '</div>';
      }
      row.innerHTML = html;

      row.addEventListener('click', function() {
        var text = '[' + err.time + '] ' + err.label +
          (err.source ? '\n📍 ' + err.source : '') +
          (err.msg ? '\n' + err.msg : '') +
          '\n\n--- Raw ---\n' + err.raw;
        if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function() {});
        row.style.background = '#3a3a40';
        setTimeout(function() { row.style.background = ''; }, 300);
      });
      tooltip.appendChild(row);
    });

    tooltip.classList.add('open');
  }

  // Show badge immediately if errors were collected
  updateBadge();

  debugBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!tooltip.classList.contains('open')) {
      tooltipOpen = true;
      renderErrors();
    } else {
      tooltipOpen = false;
      tooltip.classList.remove('open');
    }
  });

  // Re-render when new errors arrive (early layer pushes to same array)
  var _origShow = window.__obrezShowError;
  window.__obrezShowError = function(label, msg, raw) {
    _origShow(label, msg, raw);
    updateBadge();
    if (tooltipOpen) renderErrors();
  };

  document.addEventListener('click', function(e) {
    if (!tooltip.contains(e.target) && e.target !== debugBtn && !debugBtn.contains(e.target)) {
      tooltipOpen = false;
      tooltip.classList.remove('open');
    }
  });
})();
