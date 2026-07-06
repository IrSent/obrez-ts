(function() {
  // Compute base path: /obrez-ts/master/ → base = '/obrez-ts/', version = 'master'
  var parts = window.location.pathname.split('/').filter(Boolean);
  // ['', 'obrez-ts', 'master', ''] → ['obrez-ts', 'master']
  var base = '/' + parts[0] + '/';
  var currentVersion = parts[parts.length - 1] || 'master';

  // Inject styles
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
      width: 44px; height: 44px;
      background: #1a1a1a; color: #ff4444;
      border: 2px solid #ff4444; border-radius: 10px;
      font-size: 20px; line-height: 40px;
      text-align: center; cursor: pointer;
      z-index: 9999; user-select: none;
      box-shadow: 0 2px 8px rgba(255,68,68,0.3);
    }
    #obrez-debug-tooltip {
      display: none;
      position: fixed; bottom: 68px; right: 16px;
      background: #1f1f23; color: #e55;
      border: 1px solid #444; border-radius: 10px;
      padding: 12px 16px; max-width: 300px;
      font-size: 11px; font-family: monospace;
      white-space: pre-wrap; word-break: break-all;
      max-height: 200px; overflow-y: auto;
      z-index: 9999; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    }
    #obrez-debug-tooltip.open { display: block; }
  `;
  document.head.appendChild(style);

  // Gear button
  var gear = document.createElement('div');
  gear.id = 'obrez-gear';
  gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>';
  document.body.appendChild(gear);

  // Modal
  var overlay = document.createElement('div');
  overlay.id = 'obrez-modal-overlay';
  overlay.innerHTML = '<div id="obrez-modal"><h2>⚙ Настройки</h2><div class="version-list" id="obrez-version-list"></div><button class="close-btn" id="obrez-close-modal">Закрыть</button></div>';
  document.body.appendChild(overlay);

  // Load version list
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
    })
    .catch(function() {});

  // Close modal
  document.getElementById('obrez-close-modal').addEventListener('click', function() { overlay.classList.remove('open'); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.classList.remove('open'); });
  gear.addEventListener('click', function() { overlay.classList.add('open'); });

  // ── Debug button ──
  var errors = [];

  var debugBtn = document.createElement('div');
  debugBtn.id = 'obrez-debug-btn';
  debugBtn.textContent = '🐛';
  debugBtn.title = 'View errors';
  document.body.appendChild(debugBtn);

  var tooltip = document.createElement('div');
  tooltip.id = 'obrez-debug-tooltip';
  document.body.appendChild(tooltip);

  function showErrorItem(label, detail, raw) {
    errors.push({ label: label, detail: detail, raw: raw });
    renderErrors();
  }

  function renderErrors() {
    tooltip.innerHTML = '';
    if (errors.length === 0) {
      tooltip.textContent = 'No errors';
      tooltip.classList.add('open');
      setTimeout(function() { tooltip.classList.remove('open'); }, 1500);
      return;
    }
    errors.forEach(function(err, i) {
      var row = document.createElement('div');
      row.style.cssText = 'padding: 6px 0; border-bottom: 1px solid #333; cursor: pointer;';
      row.innerHTML = '<div style="color:#ff6b6b;font-weight:bold;font-size:11px;">⚠ ' + err.label + '</div>' +
        (err.detail ? '<div style="color:#999;margin-top:2px;">' + err.detail + '</div>' : '');
      row.addEventListener('click', function() {
        var text = (i + 1) + '. ' + err.label + (err.detail ? '\n' + err.detail : '') + '\n\n' + err.raw;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(text).catch(function() {});
        }
        row.style.background = '#2a2a30';
        setTimeout(function() { row.style.background = ''; }, 200);
      });
      tooltip.appendChild(row);
    });
    tooltip.classList.add('open');
  }

  // Intercept console.error
  var _origError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.map(function(a) {
      return typeof a === 'string' ? a : (a && a.stack ? a.message + '\n' + a.stack : (a && a.message ? a.message : JSON.stringify(a)));
    }).join(' ');
    showErrorItem('console.error', msg.split('\n')[0], msg);
    _origError.apply(console, arguments);
  };

  // Intercept unhandled errors
  window.addEventListener('error', function(e) {
    var detail = (e.filename || '') + (e.lineno ? ':' + e.lineno : '');
    showErrorItem('Error', e.message, e.message + '\n' + detail + '\n' + (e.error && e.error.stack || ''));
  });

  // Intercept unhandled promise rejections
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    showErrorItem('Uncaught Promise', msg, msg + '\n' + (reason && reason.stack ? reason.stack : ''));
  });

  // Toggle tooltip on button click
  debugBtn.addEventListener('click', function() {
    if (!tooltip.classList.contains('open')) {
      renderErrors();
    } else {
      tooltip.classList.remove('open');
    }
  });

  // Close tooltip when tapping elsewhere
  document.addEventListener('click', function(e) {
    if (!tooltip.contains(e.target) && e.target !== debugBtn) {
      tooltip.classList.remove('open');
    }
  });
})();
