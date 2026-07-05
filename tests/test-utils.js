'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseUnitsFromText, extractDetachment } = require('../utils');
const { isValidListBlock } = require('../crawler/lib/html');
const { GW_APP_LIST, BRACKET_PTS_LIST } = require('./fixtures');

test('parseUnitsFromText parses the spelled-out GW app "(N Points)" format', () => {
  const units = parseUnitsFromText(GW_APP_LIST);
  const names = units.map((u) => u.name);
  assert.ok(units.length >= 6, `expected >=6 units, got ${units.length}`);
  assert.ok(names.includes('Typhus'));
  assert.ok(names.includes('Deathshroud Terminators'));
  assert.equal(units.find((u) => u.name === 'Blightlord Terminators').points, 200);
});

test('parseUnitsFromText still parses the bracket "[Npts]" format', () => {
  const units = parseUnitsFromText(BRACKET_PTS_LIST);
  assert.equal(units.length, 5);
  assert.equal(units.reduce((s, u) => s + u.points, 0), 565);
});

test('isValidListBlock accepts a GW-app-format list (>=5 units, >=500 pts)', () => {
  assert.equal(isValidListBlock(GW_APP_LIST), true);
});

test('extractDetachment strips the GW app "+ ... +" decoration', () => {
  assert.equal(extractDetachment(GW_APP_LIST), 'Plague Company');
});

test('extractDetachment handles the plain "Detachment:" form', () => {
  assert.equal(extractDetachment(BRACKET_PTS_LIST), 'Plague Company');
});
