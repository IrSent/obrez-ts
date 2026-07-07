// ── EARLY ERROR INTERCEPT ──
// Loaded in <head> before anything else — catches errors from the start.
// UI (buttons, modal) is deferred to settings-ui.<hash>.js via DOMContentLoaded.
(function() {
  // Shared state on window so the UI layer can pick it up
  window.__obrezErrors = window.__obrezErrors || [];
  window.__obrezTooltipOpen = false;

  function parseStack(raw) {
    var lines = (raw || '').split('\n').slice(1);
    var source = null;
    var frames = [];
    for (var i = 0; i < lines.length && frames.length < 3; i++) {
      var ln = lines[i].trim();
      var m = ln.match(/\((.*):(\d+):\d+\)/);
      if (!m) m = ln.match(/^(\/.*?\.tsx?:\d+:\d+)/);
      if (m) {
        var file = m[1];
        var line = m[2] || '?';
        var segs = file.split('/').filter(Boolean);
        var short = segs.length > 3 ? '…/' + segs.slice(-3).join('/') : file;
        var frameStr = short + ':' + line;
        if (!source) source = frameStr;
        frames.push(frameStr);
      }
    }
    return { source: source, frames: frames };
  }

  window.__obrezShowError = function(label, msg, raw) {
    var parsed = parseStack(raw || msg);
    var firstLines = (msg || '').split('\n').slice(0, 3).join(' ');
    window.__obrezErrors.push({
      label: label,
      msg: firstLines,
      source: parsed.source,
      frames: parsed.frames,
      raw: raw || msg,
      time: new Date().toLocaleTimeString()
    });
  };

  // ── intercept console.error ──
  var _origError = console.error;
  console.error = function() {
    var args = Array.prototype.slice.call(arguments);
    var rawParts = [];
    var msgParts = [];
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a && a.stack) {
        rawParts.push(a.stack);
        msgParts.push(a.message);
      } else if (typeof a === 'string') {
        rawParts.push(a);
        msgParts.push(a);
      } else if (a && a.message) {
        rawParts.push(a.message);
        msgParts.push(a.message);
      } else if (a && typeof a === 'object') {
        var s = JSON.stringify(a);
        rawParts.push(s);
        msgParts.push(s.length > 200 ? s.slice(0, 200) + '…' : s);
      } else {
        var str = String(a);
        rawParts.push(str);
        msgParts.push(str);
      }
    }
    var msg = msgParts.join(' ');
    var raw = rawParts.join('\n');
    window.__obrezShowError('console.error', msg, raw);
    _origError.apply(console, arguments);
  };

  // ── intercept console.warn ──
  var _origWarn = console.warn;
  console.warn = function() {
    var args = Array.prototype.slice.call(arguments);
    var msg = args.map(function(a) {
      if (a && a.stack) return a.message + '\n' + a.stack;
      if (a && a.message) return a.message;
      if (typeof a === 'string') return a;
      if (a && typeof a === 'object') return JSON.stringify(a).slice(0, 300);
      return String(a);
    }).join(' ');
    window.__obrezShowError('warn', msg.split('\n')[0], msg);
    _origWarn.apply(console, arguments);
  };

  // ── intercept unhandled errors ──
  window.addEventListener('error', function(e) {
    var detail = (e.filename || '') + (e.lineno ? ':' + e.lineno : '');
    var raw = e.message + '\n' + detail + '\n' + (e.error && e.error.stack || '');
    window.__obrezShowError('Error', e.message + (detail ? ' (' + detail + ')' : ''), raw);
  });

  // ── intercept unhandled promise rejections ──
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    var raw = msg + '\n' + (reason && reason.stack ? reason.stack : '');
    window.__obrezShowError('Uncaught Promise', msg, raw);
  });

  // ── inject ngrok-skip-browser-warning into all fetch calls ──
  // Ngrok free tier shows an intercept page on browser-like requests.
  var _origFetch = window.fetch;
  window.fetch = function(resource, init) {
    if (resource && typeof resource === 'string' && resource.includes('ngrok-free.app')) {
      if (!init) init = {};
      if (!init.headers) init.headers = {};
      // Normalize headers to object
      var h = init.headers;
      if (h instanceof Headers) {
        h = Object.fromEntries(h.entries());
      }
      h['ngrok-skip-browser-warning'] = 'true';
      init.headers = h;
    }
    return _origFetch(resource, init);
  };
})();
