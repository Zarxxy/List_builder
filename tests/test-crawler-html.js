'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  detectEdition, extractPreCodeBlocks, extractBodyTextBlocks,
  isValidListBlock, extractPageDate, extractPageTitle,
} = require('../crawler/lib/html');
const { parseUnitsFromText } = require('../utils');

const UNIT_LINES = [
  'Typhus [80pts]',
  'Plague Marines [100pts]',
  'Blightlord Terminators [200pts]',
  'Predator Annihilator [130pts]',
  'Plagueburst Crawler [160pts]',
  'Deathshroud Terminators [110pts]',
  'Foul Blightspawn [60pts]',
  'Myphitic Blight-hauler [90pts]',
];

const PROSE = 'In the third round our hero pushed onto the middle objective and traded away his screens for board control. '.repeat(3);

// --- extractPreCodeBlocks / extractTextFromHtml line handling ---

test('extractPreCodeBlocks preserves <br>-separated unit lines', () => {
  const html = `<html><body><pre>Death Guard — Detachment: Plague Company<br>${UNIT_LINES.slice(0, 5).join('<br/>')}</pre></body></html>`;
  const blocks = extractPreCodeBlocks(html);
  assert.equal(blocks.length, 1);
  const units = parseUnitsFromText(blocks[0]);
  assert.equal(units.length, 5);
  assert.equal(units.reduce((s, u) => s + u.points, 0), 670);
});

test('extractPreCodeBlocks still handles literal-newline blocks and decodes entities', () => {
  const html = `<pre>Death Guard &amp; friends\n${UNIT_LINES.slice(0, 5).join('\n')}</pre>`;
  const [block] = extractPreCodeBlocks(html);
  assert.ok(block.startsWith('Death Guard & friends'));
  assert.equal(parseUnitsFromText(block).length, 5);
});

// --- extractBodyTextBlocks ---

test('extractBodyTextBlocks finds a <p>/<br> list between headings', () => {
  const html = `<html><body>
    <h2>Round 1 recap</h2><p>${PROSE}</p>
    <h2>The winning Death Guard list</h2>
    <p>Death Guard — Detachment: Plague Company<br>${UNIT_LINES.join('<br>')}</p>
    <h2>Closing thoughts</h2><p>${PROSE}</p>
  </body></html>`;
  const blocks = extractBodyTextBlocks(html);
  const listBlock = blocks.find((b) => b.includes('Plagueburst Crawler'));
  assert.ok(listBlock, 'expected a body segment containing the list');
  assert.equal(parseUnitsFromText(listBlock).length, UNIT_LINES.length);
  assert.ok(isValidListBlock(listBlock, { minUnits: 8, minPoints: 500, minUnitDensity: 0.3 }));
});

test('extractBodyTextBlocks yields no valid blocks for prose-only articles', () => {
  const html = `<html><body><h1>Battle report</h1><p>${PROSE}</p><p>${PROSE}</p></body></html>`;
  const valid = extractBodyTextBlocks(html)
    .filter((b) => isValidListBlock(b, { minUnits: 8, minPoints: 500, minUnitDensity: 0.3 }));
  assert.deepEqual(valid, []);
});

test('extractBodyTextBlocks excludes <pre>/<code> content', () => {
  const html = `<html><body><p>${PROSE}</p><pre>${UNIT_LINES.join('\n')}</pre><p>${PROSE}</p></body></html>`;
  const blocks = extractBodyTextBlocks(html);
  assert.ok(blocks.every((b) => !b.includes('Plagueburst Crawler')), 'pre content leaked into body blocks');
});

test('extractBodyTextBlocks drops tiny and oversized segments', () => {
  const huge = `<p>${'x '.repeat(9000)}</p>`; // ~18k chars, over the segment cap
  const html = `<html><body><p>tiny</p>${huge}<p>${PROSE}</p></body></html>`;
  const blocks = extractBodyTextBlocks(html);
  assert.ok(blocks.every((b) => b.length >= 80 && b.length <= 15000));
  assert.ok(!blocks.some((b) => b === 'tiny'));
});

// --- isValidListBlock thresholds ---

const FIVE_UNIT_LIST = UNIT_LINES.slice(0, 5).join('\n');

test('isValidListBlock defaults match previous behavior (5 units / 500 pts)', () => {
  assert.ok(isValidListBlock(FIVE_UNIT_LIST));
  assert.ok(!isValidListBlock(UNIT_LINES.slice(0, 4).join('\n')));
  assert.ok(!isValidListBlock('A [50pts]\nB [50pts]\nC [50pts]\nD [50pts]\nE [50pts]')); // 250 < 500
});

test('isValidListBlock honors threshold overrides', () => {
  assert.ok(isValidListBlock(UNIT_LINES.slice(0, 3).join('\n'), { minUnits: 3, minPoints: 300 }));
  assert.ok(!isValidListBlock(FIVE_UNIT_LIST, { minUnits: 6 }));
  assert.ok(!isValidListBlock(FIVE_UNIT_LIST, { minPoints: 1000 }));
});

test('isValidListBlock unit density rejects prose with embedded units', () => {
  const proseLines = Array.from({ length: 20 }, (_, i) => `Commentary line ${i} about how the game unfolded on the tabletop.`);
  const proseWithUnits = proseLines.join('\n') + '\n' + UNIT_LINES.join('\n');
  // 8 units over 28 lines ≈ 0.29 density — below the 0.5 bar.
  assert.ok(!isValidListBlock(proseWithUnits, { minUnits: 8, minPoints: 500, minUnitDensity: 0.5 }));
  assert.ok(isValidListBlock(UNIT_LINES.join('\n'), { minUnits: 8, minPoints: 500, minUnitDensity: 0.5 }));
});

// --- metadata helpers ---

test('detectEdition applies the edition cutoff date', () => {
  assert.equal(detectEdition('2025-09-15'), '11ed');
  assert.equal(detectEdition('2025-06-01'), '10ed');
  assert.equal(detectEdition('not a date'), '10ed');
  assert.equal(detectEdition(null), null);
});

test('extractPageDate prefers <time datetime>, then JSON-LD, then bare dates', () => {
  assert.equal(extractPageDate('<time datetime="2025-09-15T10:00:00Z">Sep</time> 2024-01-01'), '2025-09-15T10:00:00Z');
  assert.equal(extractPageDate('{"datePublished":"2025-05-01"}'), '2025-05-01');
  assert.equal(extractPageDate('published 2025-03-02 somewhere'), '2025-03-02');
  assert.equal(extractPageDate('no date here'), null);
});

test('extractPageTitle falls back from <title> to <h1>', () => {
  assert.equal(extractPageTitle('<title>My GT Report</title><h1>Other</h1>'), 'My GT Report');
  assert.equal(extractPageTitle('<h1 class="x">Header Only</h1>'), 'Header Only');
  assert.equal(extractPageTitle('<p>nothing</p>'), null);
});
