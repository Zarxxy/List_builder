'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { SUPPORTED_FACTIONS, factionToKey } = require('../shared/factions');
const { MOCK_DATA, getMockData } = require('../shared/mock-data');
const { scoreBand, esc, editionLabel, formatSources, renderAnalysisHtml } = require('../shared/format');
const { buildSystemText, buildUserMessage, extractJSON, factionLabel } = require('../shared/prompt');
const { config } = require('../config');

// ── factions ────────────────────────────────────────────────────────────────
test('SUPPORTED_FACTIONS has 26 entries, each with key + label', () => {
  assert.equal(SUPPORTED_FACTIONS.length, 26);
  for (const f of SUPPORTED_FACTIONS) {
    assert.ok(f.key && f.label, `bad entry ${JSON.stringify(f)}`);
  }
});

// Historical regression guards: harlequins was removed as a standalone
// faction; astra-militarum must stay present.
test('SUPPORTED_FACTIONS membership: no harlequins, has astra-militarum', () => {
  const keys = SUPPORTED_FACTIONS.map((f) => f.key);
  assert.ok(!keys.includes('harlequins'));
  assert.ok(keys.includes('astra-militarum'));
});

test('factionToKey slugs every faction label to its canonical key', () => {
  for (const f of SUPPORTED_FACTIONS) {
    assert.equal(factionToKey(f.label), f.key, `label "${f.label}" does not slug to key "${f.key}"`);
  }
});

// The faction list is enumerated in three maintained places; these two tests
// turn the "keep in sync" comment in shared/factions.js into a CI guarantee.
test('config.factionPatterns stays in sync with SUPPORTED_FACTIONS', () => {
  const labels = SUPPORTED_FACTIONS.map((f) => f.label).sort();
  assert.deepEqual(Object.keys(config.factionPatterns).sort(), labels);
});

test('crawl-deploy.yml workflow choices stay in sync with SUPPORTED_FACTIONS', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'crawl-deploy.yml'), 'utf-8');
  for (const f of SUPPORTED_FACTIONS) {
    assert.ok(yml.includes(f.label), `"${f.label}" missing from crawl-deploy.yml choices`);
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

test('buildUserMessage includes faction label, edition, sources, schema, and breakdown', () => {
  const ctx = {
    meta: { totalLists: 12, crawledAt: '2025-09-01', sources: { serp: 12 } },
    detachmentBreakdown: [{ detachment: 'Plague Company', count: 12, percentage: '100.0' }],
    topUnitsByDetachment: { 'Plague Company': [{ name: 'Plague Marines', frequency: '83.3' }] },
    sources: { serp: 12 },
    isMockData: false,
  };
  const msg = buildUserMessage('Detachment: Plague Company\nWarboss [100pts]', 'death-guard', '11ed', ctx);
  assert.ok(msg.includes('DEATH GUARD'));
  assert.ok(msg.includes('11th Edition'));
  assert.ok(msg.includes('serp: 12'));
  assert.ok(msg.includes('REQUIRED OUTPUT SCHEMA'));
  assert.ok(msg.includes('DETACHMENT BREAKDOWN'));
});

test('buildUserMessage marks mock data as synthetic', () => {
  const ctx = {
    meta: { totalLists: 5, crawledAt: null },
    detachmentBreakdown: [],
    topUnitsByDetachment: {},
    sources: {},
    isMockData: true,
  };
  const msg = buildUserMessage('test list', 'orks', '11ed', ctx);
  assert.ok(msg.includes('Synthetic'));
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

test('editionLabel maps edition codes, defaulting to 10th', () => {
  assert.equal(editionLabel('11ed'), '11th Edition');
  assert.equal(editionLabel('10ed'), '10th Edition');
});

test('formatSources joins per-source counts and returns "" when empty', () => {
  assert.equal(formatSources({ serp: 12, other: 3 }), 'serp: 12, other: 3');
  assert.equal(formatSources({}), '');
  assert.equal(formatSources(null), '');
});

test('esc neutralizes HTML/script injection (the XSS class)', () => {
  const out = esc('<img src=x onerror="alert(1)">');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.includes('"'));
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('</script>'), '&lt;/script&gt;');
});

// ── renderAnalysisHtml (shared by both front ends) ────────────────────────────
test('renderAnalysisHtml renders score band, sections, footer, and mock notice', () => {
  const result = {
    score: 7,
    score_label: 'Competitive',
    verdict: 'Solid list.',
    meta_explanation: 'Meta context.',
    detachment_analysis: 'Good detachment usage.',
    strengths: ['S1', 'S2'],
    weaknesses: ['W1'],
    comparison_points: ['C1'],
    recommendations: ['R1', 'R2'],
  };
  const html = renderAnalysisHtml(result, {
    edition: '11ed', isMockData: true, sources: {}, totalLists: 32, footerNote: 'meta snapshot',
  });
  assert.ok(html.includes('score-competitive'));
  assert.ok(html.includes('Competitive'));
  assert.ok(html.includes('Solid list.'));
  assert.ok(html.includes('<li>S1</li>'));
  assert.ok(html.includes('<div class="rec-text">R2</div>'));
  assert.ok(html.includes('mock-notice'), 'mock notice missing for isMockData');
  assert.ok(html.includes('Analyzed against 32 lists (11th Edition) · meta snapshot'));
});

test('renderAnalysisHtml shows real sources and no mock notice for live data', () => {
  const html = renderAnalysisHtml({ score: 9 }, {
    edition: '10ed', isMockData: false, sources: { serp: 4 }, totalLists: 4,
  });
  assert.ok(!html.includes('mock-notice'));
  assert.ok(html.includes('Real tournament data — sources: serp: 4'));
  assert.ok(html.includes('score-strong'));
  assert.ok(html.includes('(10th Edition)'));
});

test('renderAnalysisHtml escapes every model-output field (the XSS class)', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const result = {
    score: 5,
    score_label: payload,
    verdict: payload,
    meta_explanation: payload,
    detachment_analysis: payload,
    strengths: [payload],
    weaknesses: [payload],
    comparison_points: [payload],
    recommendations: [payload],
  };
  const html = renderAnalysisHtml(result, { edition: '11ed', isMockData: false, sources: {}, totalLists: 0 });
  assert.ok(!html.includes('<img'), 'unescaped model output leaked into HTML');
  assert.equal(html.split('&lt;img').length - 1, 8, 'expected all 8 fields escaped');
});
