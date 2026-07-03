'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// Coverage of the shared prompt/format/faction/context modules that
// list-analyzer builds on lives in tests/test-shared.js; this file tests only
// the Node-side glue that list-analyzer adds.
const {
  buildSystemBlocks,
  loadTournamentContext,
  normalizeListText,
} = require('../list-analyzer');
const { OUTPUT_DIR, outputFileFor } = require('../utils');

test('buildSystemBlocks wraps the shared system text in one ephemeral cache block', () => {
  const blocks = buildSystemBlocks('death-guard', '11ed');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'text');
  assert.equal(blocks[0].cache_control.type, 'ephemeral');
  assert.ok(blocks[0].text.includes('11th Edition'));
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
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const fixture = {
    faction: 'Test Faction',
    edition: '11ed',
    totalLists: 5,
    crawledAt: '2025-09-01T00:00:00.000Z',
    sources: { serp: 5 },
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
  const fixturePath = outputFileFor('test-faction', '11ed');
  fs.writeFileSync(fixturePath, JSON.stringify(fixture));

  const ctx = loadTournamentContext('test-faction', '11ed');
  assert.equal(ctx.isMockData, false);
  assert.ok(ctx.meta.totalLists >= 5);
  assert.ok(ctx.detachmentBreakdown.length > 0);

  fs.unlinkSync(fixturePath);
});

test('normalizeListText converts Windows line endings', () => {
  const result = normalizeListText('Line1\r\nLine2\r\nLine3');
  assert.ok(!result.includes('\r'));
  assert.ok(result.includes('Line1\nLine2\nLine3'));
});

test('normalizeListText converts NBSP and smart quotes', () => {
  const result = normalizeListText(' hello ‘smart’ “smart”');
  assert.ok(!result.includes(' '));
  assert.ok(!result.includes('‘'));
  assert.ok(!result.includes('’'));
  assert.ok(!result.includes('“'));
  assert.ok(!result.includes('”'));
  assert.ok(result.includes("'smart'"));
  assert.ok(result.includes('"smart"'));
});
