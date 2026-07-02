'use strict';

// The mock dataset now lives in shared/mock-data.js so the browser (docs page)
// and Node share a single source of truth. This module is kept as a thin
// re-export for back-compat with existing require()s and tests.
module.exports = require('./shared/mock-data');
