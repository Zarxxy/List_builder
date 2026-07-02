'use strict';

require('dotenv').config();

const fs = require('fs');
const { getArg, log, outputFileFor, OUTPUT_DIR } = require('../utils');
const { factionToKey } = require('../shared/factions');
const { normalize, deduplicate, buildOutput } = require('./merger');
const { config } = require('../config');

const args = process.argv.slice(2);

const faction  = getArg(args, '--faction')  || 'Death Guard';
const edition  = getArg(args, '--edition')  || '11ed';
const sourcesArg = getArg(args, '--sources');
const sources = sourcesArg
  ? sourcesArg.split(',').map((s) => s.trim())
  : config.crawler.enabledSources;

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  log.info(`Crawler starting — faction: "${faction}", edition: ${edition}, sources: ${sources.join(', ')}`);

  // serp is the only data source, so a missing key means the crawl cannot
  // produce anything — fail loudly instead of writing an empty dataset.
  if (sources.includes('serp') && !process.env.SERPAPI_KEY) {
    log.error('SERPAPI_KEY is not set — the serp source cannot run. Set it in .env (local) or as a repository secret (CI).');
    process.exit(1);
  }

  const opts = {
    maxLists: config.crawler.maxListsPerSource || 50,
  };

  const sourceModules = {
    serp: () => require('./sources/serp').fetchLists(faction, edition, opts),
  };

  // Each task .catch()es into a value, so Promise.all never rejects and one
  // failed source cannot take down the whole crawl.
  const tasks = sources
    .filter((s) => sourceModules[s])
    .map((s) => sourceModules[s]().then((r) => ({ source: s, entries: r, ok: true }))
      .catch((err) => { log.error(`[${s}] failed: ${err.message}`); return { source: s, entries: [], ok: false }; }));

  const results = await Promise.all(tasks);

  let allEntries = [];
  for (const val of results) {
    log.info(`Source "${val.source}": ${val.entries.length} entries${val.ok ? '' : ' (FAILED)'}`);
    allEntries = allEntries.concat(val.entries);
  }

  const normalized = normalize(allEntries, edition);
  const deduped = deduplicate(normalized);
  const output = buildOutput(deduped, faction, edition);

  log.info(`Total after dedup: ${output.totalLists} lists from ${Object.keys(output.sources).join(', ')}`);

  const outFile = outputFileFor(factionToKey(faction), edition);

  if (output.totalLists === 0 && fs.existsSync(outFile)) {
    log.error(`Crawl produced 0 lists — refusing to overwrite existing ${outFile}`);
    process.exit(1);
  }

  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf-8');
  log.info(`Saved to ${outFile}`);

  process.exit(0);
}

main().catch((err) => {
  log.error('Fatal crawler error:', err.message);
  process.exit(1);
});
