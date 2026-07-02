'use strict';

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function parseRecord(record) {
  if (!record) return null;
  const m = record.match(/(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?/);
  if (!m) return null;
  return {
    wins: parseInt(m[1], 10),
    losses: parseInt(m[2], 10),
    draws: m[3] ? parseInt(m[3], 10) : 0,
  };
}

function flattenLists(raw) {
  const lists = [];
  const seen = new Set();
  for (const [sectionName, entries] of Object.entries(raw.sections || {})) {
    for (const entry of entries) {
      const key = [entry.playerName || entry.player, entry.event, entry.date].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      lists.push({ ...entry, section: sectionName });
    }
  }
  return lists;
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
log.debug = (...a) => log('debug', ...a);

// Unit/points/detachment parsing lives in shared/list-summary.js (browser-safe,
// inlined into the docs page). Re-exported so Node callers keep their import path.
const { UNIT_REGEX, ALT_UNIT_REGEX, parseUnitsFromText, extractDetachment } = require('./shared/list-summary');

module.exports = { getArg, parseRecord, extractDetachment, flattenLists, log, UNIT_REGEX, ALT_UNIT_REGEX, parseUnitsFromText };
