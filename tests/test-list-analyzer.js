'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// Coverage of the shared prompt/format/faction modules that list-analyzer
// builds on lives in tests/test-shared.js; this file tests only the Node-side
// glue that list-analyzer adds.
const {
  buildSystemBlocks,
  loadTournamentContext,
  buildContextFromOutput,
  normalizeListText,
} = require('../list-analyzer');

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
  const outputDir = path.join(__dirname, '..', 'output');
  fs.mkdirSync(outputDir, { recursive: true });
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
    sources: { serp: 10 },
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
