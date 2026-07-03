'use strict';

// Normalizes a raw crawl artifact ({ crawledAt, faction, edition, totalLists,
// sources, sections }) into the context shape the prompt builder and renderer
// consume ({ meta, detachmentBreakdown, topUnitsByDetachment, ... }). Single
// source of truth for Node (list-analyzer.js) and the docs page (inlined by
// build-pages.js) — previously the docs page skipped this normalization and
// fed the raw file to buildUserMessage, which silently dropped all live
// tournament data from the prompt.
const { parseUnitsFromText } = require('./list-summary');

// Basename of a crawl artifact. utils.js joins it onto output/ for Node
// readers/writers; the docs page fetches it from ./data/.
function outputBasename(factionKey, edition) {
  return `army-lists-${factionKey}-${edition}-latest.json`;
}

function buildContextFromOutput(raw) {
  const meta = {
    faction: raw.faction,
    totalLists: raw.totalLists || 0,
    crawledAt: raw.crawledAt,
    edition: raw.edition,
    sources: raw.sources || {},
  };

  const detachmentBreakdown = Object.keys(raw.sections || {})
    .filter((k) => k !== 'All' && k !== 'Unknown')
    .map((det) => ({
      detachment: det,
      count: raw.sections[det].length,
      percentage: ((raw.sections[det].length / (raw.totalLists || 1)) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topUnitsByDetachment = {};
  for (const det of detachmentBreakdown) {
    const entries = raw.sections[det.detachment] || [];
    const tally = {};
    for (const entry of entries) {
      const units = parseUnitsFromText(entry.armyListText || '');
      for (const u of units) {
        tally[u.name] = (tally[u.name] || 0) + 1;
      }
    }
    topUnitsByDetachment[det.detachment] = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({
        name,
        count,
        frequency: ((count / (entries.length || 1)) * 100).toFixed(1),
      }));
  }

  return { meta, detachmentBreakdown, topUnitsByDetachment, sources: raw.sources || {}, isMockData: false, edition: raw.edition };
}

// Export for Node; the whole line is stripped when inlined into the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = { outputBasename, buildContextFromOutput }; }
