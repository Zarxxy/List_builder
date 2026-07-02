'use strict';

const path = require('path');

// Crawl artifacts live here; one file per faction+edition, overwritten by each
// crawl. The same names are matched by regex in build-pages.js and the docs
// page (browser code — keep the pattern in sync with outputFileFor below).
const OUTPUT_DIR = path.join(__dirname, 'output');
function outputFileFor(factionKey, edition) {
  return path.join(OUTPUT_DIR, `army-lists-${factionKey}-${edition}-latest.json`);
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function log(level, ...args) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (level === 'error' || level === 'warn') {
    console.error(prefix, ...args);
  } else {
    console.log(prefix, ...args);
  }
}
log.info  = (...a) => log('info',  ...a);
log.warn  = (...a) => log('warn',  ...a);
log.error = (...a) => log('error', ...a);

// Unit/points/detachment parsing lives in shared/list-summary.js (browser-safe,
// inlined into the docs page). Re-exported so Node callers keep their import path.
const { parseUnitsFromText, extractDetachment } = require('./shared/list-summary');

module.exports = { OUTPUT_DIR, outputFileFor, getArg, extractDetachment, log, parseUnitsFromText };
