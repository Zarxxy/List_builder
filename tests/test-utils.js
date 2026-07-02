'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseUnitsFromText, extractDetachment } = require('../utils');
const { isValidListBlock } = require('../crawler/lib/html');

// The official Games Workshop 40K app is the dominant export format for modern
// tournament lists. It spells points out as "(100 Points)" and wraps header
// lines in "+ ... +". These fixtures guard the parser against regressing to a
// state where GW-app lists yield zero data points (units) and get filtered out.
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
