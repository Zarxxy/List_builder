'use strict';

const crypto = require('node:crypto');
const { extractDetachment, parseUnitsFromText } = require('../utils');

function normalizePlayer(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeEvent(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^\w\s]/g, '').trim().slice(0, 30);
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function datesWithin7Days(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.getTime() - b.getTime()) <= 7 * 24 * 60 * 60 * 1000;
}

function contentHash(text) {
  return crypto.createHash('sha256').update((text || '').slice(0, 500)).digest('hex');
}

function normalize(entries, defaultEdition) {
  return entries.map((e) => {
    const text = (e.armyListText || '').trim();
    return {
      playerName: e.playerName ? e.playerName.trim() : null,
      event: e.event ? e.event.trim() : null,
      date: e.date ? e.date.trim() : null,
      record: e.record ? e.record.trim() : null,
      detachment: e.detachment ? e.detachment.trim() : (extractDetachment(text) || null),
      armyListText: text,
      source: e.source || 'unknown',
      sourceUrl: e.sourceUrl || null,
      edition: e.edition || defaultEdition || '11ed',
      firstSeen: e.firstSeen || new Date().toISOString(),
    };
  });
}

function deduplicate(entries) {
  const byPrimaryKey = new Map();
  const byHashKey = new Map();

  for (const entry of entries) {
    const np = normalizePlayer(entry.playerName);
    const ne = normalizeEvent(entry.event);
    const date = parseDate(entry.date);

    // Primary key dedup: normalized player + event + fuzzy date
    if (np || ne) {
      let matched = false;
      for (const [key, existing] of byPrimaryKey) {
        const [ep, ee] = key.split('\x00');
        const existDate = parseDate(existing.date);
        if (ep === np && ee === ne && datesWithin7Days(date, existDate)) {
          if (entry.armyListText.length > existing.armyListText.length) {
            byPrimaryKey.set(key, entry);
          }
          matched = true;
          break;
        }
      }
      if (!matched) {
        byPrimaryKey.set(`${np}\x00${ne}`, entry);
      }
    } else {
      // Content hash fallback for anonymous entries
      const units = parseUnitsFromText(entry.armyListText);
      if (units.length >= 3) {
        const hash = contentHash(entry.armyListText);
        if (!byHashKey.has(hash)) {
          byHashKey.set(hash, entry);
        }
      }
    }
  }

  return [...byPrimaryKey.values(), ...byHashKey.values()];
}

function buildOutput(entries, faction, edition) {
  const crawledAt = new Date().toISOString();
  const sources = {};
  const sections = { All: [] };

  for (const entry of entries) {
    sources[entry.source] = (sources[entry.source] || 0) + 1;
    sections.All.push(entry);
    const det = entry.detachment || 'Unknown';
    if (!sections[det]) sections[det] = [];
    sections[det].push(entry);
  }

  return {
    crawledAt,
    faction,
    edition,
    totalLists: entries.length,
    sources,
    sections,
  };
}

module.exports = { normalize, deduplicate, buildOutput };
