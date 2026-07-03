'use strict';

const path = require('path');

// Crawl artifacts live here; one file per faction+edition, overwritten by each
// crawl. The basename scheme is owned by shared/tournament-context.js (the
// docs page fetches the same names from ./data/); build-pages.js matches them
// by regex when copying.
const { outputBasename } = require('./shared/tournament-context');
const OUTPUT_DIR = path.join(__dirname, 'output');
function outputFileFor(factionKey, edition) {
  return path.join(OUTPUT_DIR, outputBasename(factionKey, edition));
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
