'use strict';

// Presentation helpers shared by the browser front ends. Node does not use
// these, but they are colocated here so the two HTML pages stop duplicating
// them. build-pages.js inlines this into the static docs page; the server
// serves it to public/index.html via the /shared static route.

// Map an integer score (1–10) to a CSS band name.
function scoreBand(n) {
  if (n <= 3) return 'casual';
  if (n <= 5) return 'below-meta';
  if (n <= 7) return 'competitive';
  if (n <= 9) return 'strong';
  return 'meta-optimal';
}

// Escape a string for safe interpolation into innerHTML. Model output is
// attacker-influenceable (it echoes the user-pasted army list), so every
// interpolation must pass through this to prevent XSS.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Export for Node; skipped when loaded as a plain browser script.
if (typeof module !== 'undefined' && module.exports) { module.exports = { scoreBand, esc }; }
