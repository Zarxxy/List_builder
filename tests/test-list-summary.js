'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { summarizeList, extractDeclaredPoints } = require('../shared/list-summary');
const { renderListSummaryHtml } = require('../shared/format');

const GW_APP_LIST = `+ FACTION KEYWORD: Chaos - Death Guard +
+ DETACHMENT: Plague Company +
+ TOTAL ARMY POINTS: 2000pts +

CHARACTERS

Typhus (100 Points)
  • 1x Master of the Plague Company

Lord of Virulence (80 Points)

BATTLELINE

Plague Marines (100 Points)
  • 4x Plague Marine

OTHER DATASHEETS

Deathshroud Terminators (110 Points)
Blightlord Terminators (200 Points)
Foul Blightspawn (55 Points)`;

const BRACKET_PTS_LIST = `Detachment: Plague Company
Plague Marines [100pts]
Typhus [100pts]
Deathshroud Terminators [110pts]
Blightlord Terminators [200pts]
Foul Blightspawn [55pts]`;

// ── extractDeclaredPoints ────────────────────────────────────────────────────
test('extractDeclaredPoints reads the GW app "TOTAL ARMY POINTS" header', () => {
  assert.equal(extractDeclaredPoints(GW_APP_LIST), 2000);
});

test('extractDeclaredPoints reads a plain "Total Points: N" line', () => {
  assert.equal(extractDeclaredPoints('Total Points: 1500\nUnit [100pts]'), 1500);
});

test('extractDeclaredPoints falls back to a first-line "(N Points)" title', () => {
  assert.equal(extractDeclaredPoints('My Army (2000 Points)\nTyphus (100 Points)'), 2000);
});

test('extractDeclaredPoints does not read unit lines below the title', () => {
  assert.equal(extractDeclaredPoints(BRACKET_PTS_LIST), null);
});

// ── summarizeList ────────────────────────────────────────────────────────────
test('summarizeList returns null for empty or too-short input', () => {
  assert.equal(summarizeList(''), null);
  assert.equal(summarizeList('   \n '), null);
  assert.equal(summarizeList('short'), null);
});

test('summarizeList summarizes a GW-app list: units, points, detachment, declared', () => {
  const s = summarizeList(GW_APP_LIST);
  assert.ok(s.unitCount >= 6, `expected >=6 units, got ${s.unitCount}`);
  assert.equal(s.detachment, 'Plague Company');
  assert.equal(s.declaredPoints, 2000);
  assert.equal(s.totalPoints, s.units.reduce((sum, u) => sum + u.points, 0));
});

test('summarizeList warns when parsed points fall short of the declared total', () => {
  const s = summarizeList(GW_APP_LIST); // parses 645pts of a declared 2000
  assert.ok(s.warnings.some((w) => /645pts of the declared 2000pts/.test(w)), JSON.stringify(s.warnings));
});

test('summarizeList warns when parsed points exceed the declared total', () => {
  const s = summarizeList('Total Points: 500\nBig Unit [400pts]\nOther Unit [200pts]');
  assert.ok(s.warnings.some((w) => /over the declared 500pts/.test(w)), JSON.stringify(s.warnings));
});

test('summarizeList warns when no units parse and no detachment is found', () => {
  const s = summarizeList('this is just some prose, not an army list at all');
  assert.equal(s.unitCount, 0);
  assert.ok(s.warnings.some((w) => /No units with points values/.test(w)));
  assert.ok(s.warnings.some((w) => /No "Detachment:" line/.test(w)));
});

test('summarizeList emits no points warnings for a clean bracket-format list', () => {
  const s = summarizeList(BRACKET_PTS_LIST); // 565pts, no declared total, under 2000
  assert.equal(s.totalPoints, 565);
  assert.equal(s.detachment, 'Plague Company');
  assert.deepEqual(s.warnings, []);
});

test('summarizeList does not count a GW-app title line "(2000 points)" as a unit', () => {
  const s = summarizeList('crusher stampede (2000 points)\nDetachment: Crusher Stampede\nNorn Emissary (250 Points)\nExocrine (135 Points)');
  assert.equal(s.declaredPoints, 2000);
  assert.equal(s.unitCount, 2);
  assert.equal(s.totalPoints, 385);
});

test('summarizeList warns above 2000pts when no total is declared', () => {
  const s = summarizeList('Detachment: Big\nUnit A [1500pts]\nUnit B [900pts]');
  assert.ok(s.warnings.some((w) => /over the standard 2000pt/.test(w)), JSON.stringify(s.warnings));
});

// ── renderListSummaryHtml ────────────────────────────────────────────────────
test('renderListSummaryHtml renders chips + warnings and returns "" for null', () => {
  assert.equal(renderListSummaryHtml(null), '');
  const html = renderListSummaryHtml(summarizeList(GW_APP_LIST));
  assert.ok(html.includes('Detachment: Plague Company'));
  assert.ok(html.includes('units parsed'));
  assert.ok(html.includes('/ 2000pts declared'));
  assert.ok(html.includes('summary-warning'));
});

test('renderListSummaryHtml escapes attacker-influenceable detachment text', () => {
  const s = summarizeList('Detachment: <img src=x onerror=alert(1)>\nUnit [100pts]');
  const html = renderListSummaryHtml(s);
  assert.ok(!html.includes('<img'), 'unescaped detachment leaked into HTML');
});
