'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  buildSystemBlocks,
  extractJSON,
  loadTournamentContext,
  buildContextFromOutput,
  buildUserMessage,
  normalizeListText,
  SUPPORTED_FACTIONS,
} = require('../list-analyzer');

test('buildSystemBlocks returns one ephemeral block for 11th edition', () => {
  const blocks = buildSystemBlocks('death-guard', '11ed');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'text');
  assert.equal(blocks[0].cache_control.type, 'ephemeral');
  assert.ok(blocks[0].text.includes('11th Edition'));
});

test('buildSystemBlocks returns 10th edition label', () => {
  const blocks = buildSystemBlocks('space-marines', '10ed');
  assert.ok(blocks[0].text.includes('10th Edition'));
});

test('extractJSON parses bare JSON', () => {
  const result = extractJSON('{"score":7}');
  assert.deepEqual(result, { score: 7 });
});

test('extractJSON parses markdown-fenced JSON', () => {
  const result = extractJSON('```json\n{"score":5}\n```');
  assert.deepEqual(result, { score: 5 });
});

test('extractJSON parses JSON with surrounding text', () => {
  const result = extractJSON('Here is the result:\n{"score":8,"label":"Strong"}\nThat is all.');
  assert.deepEqual(result, { score: 8, label: 'Strong' });
});

test('extractJSON returns null for garbage', () => {
  const result = extractJSON('This is not JSON at all!');
  assert.equal(result, null);
});

test('loadTournamentContext falls back to mock data for space-marines 11ed', () => {
  const ctx = loadTournamentContext('space-marines', '11ed');
  assert.equal(ctx.isMockData, true);
  assert.ok(ctx.detachmentBreakdown.length > 0);
  assert.ok(ctx.meta.totalLists > 0);
});

test('loadTournamentContext returns empty context for unknown faction', () => {
  const ctx = loadTournamentContext('some-unknown-faction-xyz', '11ed');
  assert.equal(ctx.meta.totalLists, 0);
  assert.equal(ctx.detachmentBreakdown.length, 0);
});

test('loadTournamentContext reads real fixture file when present', () => {
  const outputDir = path.join(__dirname, '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
  const fixture = {
    faction: 'Test Faction',
    edition: '11ed',
    totalLists: 5,
    crawledAt: '2025-09-01T00:00:00.000Z',
    sources: { listhammer: 5 },
    sections: {
      All: [
        { armyListText: 'Detachment: Test Detachment\nWarboss [100pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]', detachment: 'Test Detachment' },
        { armyListText: 'Detachment: Test Detachment\nWarboss [100pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]', detachment: 'Test Detachment' },
      ],
      'Test Detachment': [
        { armyListText: 'Detachment: Test Detachment\nWarboss [100pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]', detachment: 'Test Detachment' },
        { armyListText: 'Detachment: Test Detachment\nWarboss [100pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]\nBoyz [90pts]', detachment: 'Test Detachment' },
      ],
    },
  };
  const fixturePath = path.join(outputDir, 'army-lists-test-faction-11ed-latest.json');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));

  const ctx = loadTournamentContext('test-faction', '11ed');
  assert.equal(ctx.isMockData, false);
  assert.ok(ctx.meta.totalLists >= 5);
  assert.ok(ctx.detachmentBreakdown.length > 0);

  fs.unlinkSync(fixturePath);
});

test('buildContextFromOutput extracts detachmentBreakdown correctly', () => {
  const raw = {
    faction: 'Death Guard',
    edition: '11ed',
    totalLists: 10,
    crawledAt: '2025-09-01T00:00:00.000Z',
    sources: { listhammer: 10 },
    sections: {
      All: [],
      'Plague Company': Array(6).fill({ armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]\nPlague Marines [100pts]\nPlague Marines [100pts]\nDeath Guard Lord [110pts]\nBlightlord Terminators [200pts]', detachment: 'Plague Company' }),
      'Contagion of Nurgle': Array(4).fill({ armyListText: 'Detachment: Contagion of Nurgle\nPlague Marines [100pts]\nPlague Marines [100pts]\nPlague Marines [100pts]\nDeath Guard Lord [110pts]\nBlightlord Terminators [200pts]', detachment: 'Contagion of Nurgle' }),
    },
  };
  const ctx = buildContextFromOutput(raw);
  assert.equal(ctx.isMockData, false);
  assert.equal(ctx.detachmentBreakdown.length, 2);
  assert.equal(ctx.detachmentBreakdown[0].detachment, 'Plague Company');
  assert.equal(ctx.detachmentBreakdown[0].count, 6);
  assert.ok(ctx.topUnitsByDetachment['Plague Company'].length > 0);
});

test('buildUserMessage includes edition label, source line, and schema', () => {
  const ctx = {
    meta: { totalLists: 12, crawledAt: '2025-09-01', edition: '11ed', sources: { listhammer: 12 } },
    detachmentBreakdown: [{ detachment: 'Plague Company', count: 12, percentage: '100.0' }],
    topUnitsByDetachment: { 'Plague Company': [{ name: 'Plague Marines', count: 10, frequency: '83.3' }] },
    sources: { listhammer: 12 },
    isMockData: false,
  };
  const msg = buildUserMessage('Detachment: Plague Company\nWarboss [100pts]', 'death-guard', '11ed', ctx);
  assert.ok(msg.includes('11th Edition'));
  assert.ok(msg.includes('listhammer'));
  assert.ok(msg.includes('REQUIRED OUTPUT SCHEMA'));
  assert.ok(msg.includes('DETACHMENT BREAKDOWN'));
});

test('buildUserMessage marks mock data as synthetic', () => {
  const ctx = {
    meta: { totalLists: 5, crawledAt: null, edition: '11ed' },
    detachmentBreakdown: [],
    topUnitsByDetachment: {},
    sources: {},
    isMockData: true,
  };
  const msg = buildUserMessage('test list', 'orks', '11ed', ctx);
  assert.ok(msg.includes('Synthetic'));
});

test('normalizeListText converts Windows line endings', () => {
  const result = normalizeListText('Line1\r\nLine2\r\nLine3');
  assert.ok(!result.includes('\r'));
  assert.ok(result.includes('Line1\nLine2\nLine3'));
});

test('normalizeListText converts NBSP and smart quotes', () => {
  const result = normalizeListText(' hello ‘smart’ “smart”');
  assert.ok(!result.includes(' '));
  assert.ok(!result.includes('‘'));
  assert.ok(!result.includes('’'));
  assert.ok(!result.includes('“'));
  assert.ok(!result.includes('”'));
  assert.ok(result.includes("'smart'"));
  assert.ok(result.includes('"smart"'));
});

test('SUPPORTED_FACTIONS has exactly 26 entries', () => {
  assert.equal(SUPPORTED_FACTIONS.length, 26);
});

test('SUPPORTED_FACTIONS does not include harlequins', () => {
  const keys = SUPPORTED_FACTIONS.map(f => f.key);
  assert.ok(!keys.includes('harlequins'));
});

test('SUPPORTED_FACTIONS includes astra-militarum', () => {
  const keys = SUPPORTED_FACTIONS.map(f => f.key);
  assert.ok(keys.includes('astra-militarum'));
});

test('SUPPORTED_FACTIONS all entries have key and label', () => {
  for (const f of SUPPORTED_FACTIONS) {
    assert.ok(f.key, `Missing key on ${JSON.stringify(f)}`);
    assert.ok(f.label, `Missing label on ${JSON.stringify(f)}`);
  }
});
