'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { normalize, deduplicate, buildOutput } = require('../crawler/merger');

const sampleEntry = (overrides = {}) => ({
  playerName: 'Test Player',
  event: 'Test Tournament',
  date: '2025-09-15',
  record: '4-2-0',
  detachment: null,
  armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]\nPlague Marines [100pts]\nPlague Marines [100pts]',
  source: 'listhammer',
  sourceUrl: 'https://listhammer.info/test',
  edition: '11ed',
  firstSeen: '2025-09-15T10:00:00.000Z',
  ...overrides,
});

test('normalize trims whitespace from string fields', () => {
  const entries = [sampleEntry({ playerName: '  Alice  ', event: '  Grand Tournament  ' })];
  const result = normalize(entries, '11ed');
  assert.equal(result[0].playerName, 'Alice');
  assert.equal(result[0].event, 'Grand Tournament');
});

test('normalize extracts detachment when null', () => {
  const entries = [sampleEntry({ detachment: null })];
  const result = normalize(entries, '11ed');
  assert.equal(result[0].detachment, 'Plague Company');
});

test('normalize preserves existing detachment', () => {
  const entries = [sampleEntry({ detachment: 'Foetid Virion' })];
  const result = normalize(entries, '11ed');
  assert.equal(result[0].detachment, 'Foetid Virion');
});

test('normalize sets edition from default when missing', () => {
  const entries = [sampleEntry({ edition: null })];
  const result = normalize(entries, '11ed');
  assert.equal(result[0].edition, '11ed');
});

test('normalize sets edition from 10ed default', () => {
  const entries = [sampleEntry({ edition: '' })];
  const result = normalize(entries, '10ed');
  assert.equal(result[0].edition, '10ed');
});

test('deduplicate by primary key keeps longer armyListText', () => {
  const short = sampleEntry({ armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]' });
  const long  = sampleEntry({ armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]\nPlague Marines [100pts]\nPlague Marines [100pts]\nMore units here' });
  const result = deduplicate([short, long]);
  assert.equal(result.length, 1);
  assert.ok(result[0].armyListText.length > short.armyListText.length);
});

test('deduplicate handles normalized player names (case, non-alpha)', () => {
  const a = sampleEntry({ playerName: 'John O\'Brien', armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]' });
  const b = sampleEntry({ playerName: 'john obrien',  armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]\nMore' });
  const result = deduplicate([a, b]);
  assert.equal(result.length, 1);
});

test('deduplicate by content hash catches same list under different players', () => {
  const text = 'Detachment: Plague Company\nPlague Marines [100pts]\nPlague Marines [100pts]\nPlague Marines [100pts]\nDaemon Prince [165pts]\nBlightlord Terminators [200pts]';
  const a = sampleEntry({ playerName: 'Alice',  event: 'Event A', date: '2025-08-01', armyListText: text });
  const b = sampleEntry({ playerName: 'Bob',    event: 'Event B', date: '2025-09-20', armyListText: text });
  const result = deduplicate([a, b]);
  assert.equal(result.length, 1);
});

test('deduplicate with empty input returns []', () => {
  assert.deepEqual(deduplicate([]), []);
});

test('deduplicate keeps distinct lists', () => {
  const a = sampleEntry({ playerName: 'Alice', event: 'Event A', date: '2025-08-01', armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]' });
  const b = sampleEntry({ playerName: 'Bob',   event: 'Event B', date: '2025-09-01', armyListText: 'Detachment: Foetid Virion\nDaemon Prince [165pts]\nBlightlord Terminators [200pts]' });
  const result = deduplicate([a, b]);
  assert.equal(result.length, 2);
});

test('buildOutput groups null detachment into Unknown section', () => {
  const entries = [
    sampleEntry({ detachment: null }),
    sampleEntry({ detachment: 'Plague Company', playerName: 'Bob', event: 'B', date: '2025-10-01' }),
  ];
  const normalized = normalize(entries, '11ed');
  // Force null detachment for first entry after normalize
  normalized[0].detachment = null;
  const output = buildOutput(normalized, 'Death Guard', '11ed');
  assert.ok(output.sections['Unknown']);
  assert.equal(output.sections['Unknown'].length, 1);
});

test('buildOutput sections include All', () => {
  const entries = [sampleEntry(), sampleEntry({ playerName: 'Bob', event: 'B', date: '2025-10-01' })];
  const normalized = normalize(entries, '11ed');
  const output = buildOutput(normalized, 'Death Guard', '11ed');
  assert.ok(Array.isArray(output.sections['All']));
  assert.ok(output.sections['All'].length >= 1);
});

test('buildOutput has correct shape', () => {
  const entries = [sampleEntry()];
  const output = buildOutput(normalize(entries, '11ed'), 'Death Guard', '11ed');
  assert.ok(output.crawledAt);
  assert.equal(output.faction, 'Death Guard');
  assert.equal(output.edition, '11ed');
  assert.ok(typeof output.totalLists === 'number');
  assert.ok(output.sources);
  assert.ok(output.sections);
});

test('buildOutput counts sources correctly', () => {
  const entries = [
    sampleEntry({ source: 'listhammer' }),
    sampleEntry({ source: 'listhammer', playerName: 'Bob', event: 'B', date: '2025-10-01', armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]\nExtra units here and more' }),
    sampleEntry({ source: 'goonhammer', playerName: 'Carol', event: 'C', date: '2025-11-01', armyListText: 'Detachment: Plague Company\nPlague Marines [100pts]\nGoonhammer source unique text here' }),
  ];
  const output = buildOutput(normalize(entries, '11ed'), 'Death Guard', '11ed');
  assert.ok(output.sources.listhammer >= 1);
  assert.ok(output.sources.goonhammer >= 1);
});
