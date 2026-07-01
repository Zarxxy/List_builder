'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { SUPPORTED_FACTIONS } = require('../shared/factions');
const { MOCK_DATA, getMockData } = require('../shared/mock-data');
const { scoreBand, esc } = require('../shared/format');
const { buildSystemText, buildUserMessage, extractJSON, factionLabel } = require('../shared/prompt');

// ── factions ────────────────────────────────────────────────────────────────
test('SUPPORTED_FACTIONS has 26 entries, each with key + label', () => {
  assert.equal(SUPPORTED_FACTIONS.length, 26);
  for (const f of SUPPORTED_FACTIONS) {
    assert.ok(f.key && f.label, `bad entry ${JSON.stringify(f)}`);
  }
});

// ── mock data (regression guard for the old docs 7-vs-8 drift) ────────────────
test('MOCK_DATA exposes all 8 faction-edition keys including chaos-space-marines-10ed', () => {
  assert.equal(Object.keys(MOCK_DATA).length, 8);
  assert.ok(MOCK_DATA['chaos-space-marines-10ed'], 'missing key that had drifted out of docs');
});

test('getMockData defaults edition to 11ed and returns null for unknown', () => {
  assert.ok(getMockData('death-guard'));
  assert.equal(getMockData('death-guard').meta.edition, '11ed');
  assert.equal(getMockData('not-a-faction', '11ed'), null);
});

// ── prompt builders ───────────────────────────────────────────────────────────
test('factionLabel resolves key to label, falls back to key', () => {
  assert.equal(factionLabel('death-guard'), 'Death Guard');
  assert.equal(factionLabel('unknown-key'), 'unknown-key');
});

test('buildSystemText uses the correct edition label', () => {
  assert.ok(buildSystemText('death-guard', '11ed').includes('11th Edition'));
  assert.ok(buildSystemText('space-marines', '10ed').includes('10th Edition'));
});

test('buildUserMessage includes faction label, edition, schema, and breakdown', () => {
  const ctx = {
    meta: { totalLists: 12, crawledAt: '2025-09-01', sources: { listhammer: 12 } },
    detachmentBreakdown: [{ detachment: 'Plague Company', count: 12, percentage: '100.0' }],
    topUnitsByDetachment: { 'Plague Company': [{ name: 'Plague Marines', frequency: '83.3' }] },
    sources: { listhammer: 12 },
    isMockData: false,
  };
  const msg = buildUserMessage('Detachment: Plague Company\nWarboss [100pts]', 'death-guard', '11ed', ctx);
  assert.ok(msg.includes('DEATH GUARD'));
  assert.ok(msg.includes('11th Edition'));
  assert.ok(msg.includes('REQUIRED OUTPUT SCHEMA'));
  assert.ok(msg.includes('DETACHMENT BREAKDOWN'));
});

test('extractJSON parses bare, fenced, and embedded JSON; null on garbage', () => {
  assert.deepEqual(extractJSON('{"score":7}'), { score: 7 });
  assert.deepEqual(extractJSON('```json\n{"score":5}\n```'), { score: 5 });
  assert.deepEqual(extractJSON('text {"score":8} more'), { score: 8 });
  assert.equal(extractJSON('not json'), null);
});

// ── format ────────────────────────────────────────────────────────────────────
test('scoreBand maps score to band at each boundary', () => {
  assert.equal(scoreBand(3), 'casual');
  assert.equal(scoreBand(5), 'below-meta');
  assert.equal(scoreBand(7), 'competitive');
  assert.equal(scoreBand(9), 'strong');
  assert.equal(scoreBand(10), 'meta-optimal');
});

test('esc neutralizes HTML/script injection (the XSS class)', () => {
  const out = esc('<img src=x onerror="alert(1)">');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('"'));
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('</script>'), '&lt;/script&gt;');
});
