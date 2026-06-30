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

function extractDetachment(text) {
  if (!text) return null;
  const m = text.match(/Detachment:\s*(.+?)(?:\n|$)/i) ||
            text.match(/Detachment\s*[-–:]\s*(.+?)(?:\n|$)/i);
  return m ? m[1].trim() : null;
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

const UNIT_REGEX = /^[•·\-\s]*(.+?)\s*[([]\s*(\d+)\s*pts?\s*[\])]/gim;
const ALT_UNIT_REGEX = /^[•·\-\s]*(.+?)\s{2,}\.{0,}?\s*(\d{2,4})\s*pts?\s*$/gim;

function parseUnitsFromText(text, maxNameLength) {
  if (!text) return [];
  const cap = maxNameLength || 80;
  const units = [];
  const seen = new Set();

  UNIT_REGEX.lastIndex = 0;
  let m;
  while ((m = UNIT_REGEX.exec(text)) !== null) {
    const rawName = m[1].trim().replace(/^[x×]\d+\s+/i, '').replace(/\s*[-–:]\s*$/, '');
    const pts = parseInt(m[2], 10);
    if (rawName && pts > 0 && rawName.length < cap) {
      const key = rawName + '|' + pts;
      if (!seen.has(key)) {
        seen.add(key);
        units.push({ name: rawName, points: pts });
      }
    }
  }

  ALT_UNIT_REGEX.lastIndex = 0;
  while ((m = ALT_UNIT_REGEX.exec(text)) !== null) {
    const rawName = m[1].trim().replace(/\.+$/, '').trim();
    const pts = parseInt(m[2], 10);
    if (rawName && pts > 0 && rawName.length < cap) {
      const key = rawName + '|' + pts;
      if (!seen.has(key)) {
        seen.add(key);
        units.push({ name: rawName, points: pts });
      }
    }
  }

  return units;
}

module.exports = { getArg, parseRecord, extractDetachment, flattenLists, log, UNIT_REGEX, ALT_UNIT_REGEX, parseUnitsFromText };
