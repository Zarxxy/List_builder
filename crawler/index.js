'use strict';

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

let browser = null;

async function shutdown(b) {
  if (b) await b.close().catch(() => {});
  process.exit(0);
}

process.on('SIGTERM', () => shutdown(browser));
process.on('SIGINT',  () => shutdown(browser));

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  log.info(`Crawler starting — faction: "${faction}", edition: ${edition}, sources: ${sources.join(', ')}`);

  const PLAYWRIGHT_SOURCES = ['listhammer', 'bcp', 'tabletop-to'];

  const usesPlaywright = sources.some((s) => PLAYWRIGHT_SOURCES.includes(s));
  const usesToS = sources.some((s) => ['bcp', 'tabletop-to'].includes(s));

  if (usesToS) {
    log.warn('WARNING: BCP/Tabletop.to scraping may violate the platform\'s Terms of Service. Enable only for personal/research use.');
  }

  if (usesPlaywright) {
    const { chromium } = require('playwright');
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });
  }

  const opts = {
    maxLists: config.crawler.maxListsPerSource || 50,
    timeout: config.crawler.navTimeout || 60000,
    browser,
  };

  const sourceModules = {
    listhammer: () => require('./sources/listhammer').fetchLists(faction, edition, opts),
    goonhammer: () => require('./sources/goonhammer').fetchLists(faction, edition, opts),
    serp: () => require('./sources/serp').fetchLists(faction, edition, opts),
    bcp: () => {
      if (!browser) return Promise.resolve([]);
      return require('./sources/bcp').createFetcher(browser)(faction, edition, opts);
    },
    'tabletop-to': () => {
      if (!browser) return Promise.resolve([]);
      return require('./sources/tabletop-to').createFetcher(browser)(faction, edition, opts);
    },
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

  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }

  const normalized = normalize(allEntries, edition);
  const deduped = deduplicate(normalized);
  const output = buildOutput(deduped, faction, edition);

  log.info(`Total after dedup: ${output.totalLists} lists from ${Object.keys(output.sources).join(', ')}`);

  const factionKey = faction.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const outFile = path.join(OUTPUT_DIR, `army-lists-${factionKey}-${edition}-latest.json`);
  fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf-8');
  log.info(`Saved to ${outFile}`);

  process.exit(0);
}

main().catch((err) => {
  log.error('Fatal crawler error:', err.message);
  if (browser) browser.close().catch(() => {});
  process.exit(1);
});
