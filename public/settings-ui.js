// ── SETTINGS UI (vanilla JS) ──
// Loaded via DOMContentLoaded after settings-early.js has been running.
//
// React now handles: gear button, debug button, settings modal.
// This script only injects CSS for the gear button hover animation.

(function() {
  var style = document.createElement('style');
  style.textContent = `
    #obrez-gear {
      transition: color 0.2s;
    }
    #obrez-gear:hover {
      color: #a855f7;
      animation: obrez-spin 12s linear infinite;
    }
    @keyframes obrez-spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
})();
