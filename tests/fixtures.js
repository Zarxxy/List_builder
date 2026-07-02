'use strict';

// Canonical army-list fixtures shared by the parser test suites
// (test-utils.js, test-list-summary.js) so both always exercise the same
// inputs.
//
// The official Games Workshop 40K app is the dominant export format for modern
// tournament lists. It spells points out as "(100 Points)" and wraps header
// lines in "+ ... +". GW_APP_LIST guards the parser against regressing to a
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

// The older community "[Npts]" bracket format.
const BRACKET_PTS_LIST = `Detachment: Plague Company
Plague Marines [100pts]
Typhus [100pts]
Deathshroud Terminators [110pts]
Blightlord Terminators [200pts]
Foul Blightspawn [55pts]`;

module.exports = { GW_APP_LIST, BRACKET_PTS_LIST };
