'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getArg, log } = require('../utils');
const { normalize, deduplicate, buildOutput } = require('./merger');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf-8'));
const args = process.argv.slice(2);

const faction  = getArg(args, '--faction')  || 'Death Guard';
const edition  = getArg(args, '--edition')  || '11ed';
const sourcesArg = getArg(args, '--sources');
const sources = sourcesArg
  ? sourcesArg.split(',').map((s) => s.trim())
  : config.crawler.enabledSources;

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

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

  const tasks = sources
    .filter((s) => sourceModules[s])
    .map((s) => sourceModules[s]().then((r) => ({ source: s, entries: r, ok: true }))
      .catch((err) => { log.error(`[${s}] failed: ${err.message}`); return { source: s, entries: [], ok: false }; }));

  const settled = await Promise.allSettled(tasks);

  let allEntries = [];
  for (const result of settled) {
    const val = result.status === 'fulfilled' ? result.value : { source: '?', entries: [], ok: false };
    log.info(`Source "${val.source}": ${val.entries.length} entries${val.ok ? '' : ' (FAILED)'}`);
    allEntries = allEntries.concat(val.entries);
  }

  const normalized = normalize(allEntries, edition);
  const deduped = deduplicate(normalized);
  const output = buildOutput(deduped, faction, edition);

  log.info(`Total after dedup: ${output.totalLists} lists from ${Object.keys(output.sources).join(', ')}`);

  const factionKey = faction.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const outFile = path.join(OUTPUT_DIR, `army-lists-${factionKey}-${edition}-latest.json`);

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
