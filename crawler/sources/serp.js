'use strict';

const fs = require('fs');
const path = require('path');
const { extractDetachment } = require('../../utils');
const config = require('../../config.json');
const { detectEdition, sleep, extractPreCodeBlocks, isValidListBlock } = require('../lib/html');

const CACHE_TTL_DAYS = config.crawler.serpCacheTTLDays || 7;
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');

function extractPageDate(html) {
  const m = html.match(/<time[^>]*datetime="([^"]+)"/i) ||
            html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ||
            html.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function fetchLists(faction, edition, opts = {}) {
  const { maxLists = 50 } = opts;
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.warn('[serp] SERPAPI_KEY not set — skipping SerpAPI source');
    return [];
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const editionLabel = edition === '11ed' ? '11th Edition' : '10th Edition';
  const query = `"${faction}" top tournament list warhammer "${editionLabel}"`;
  const cacheFile = path.join(OUTPUT_DIR, `serp-cache-${faction.replace(/\s+/g, '-').toLowerCase()}-${edition}.json`);

  let serpResults = null;

  // Check cache
  if (fs.existsSync(cacheFile)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const age = (Date.now() - new Date(cached.cachedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (age < CACHE_TTL_DAYS) {
        serpResults = cached.results;
        console.log(`[serp] Using cached SERP results (${age.toFixed(1)} days old)`);
      }
    } catch {}
  }

  if (!serpResults) {
    const serpUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&num=10&api_key=${apiKey}`;
    console.log(`[serp] Querying SerpAPI: ${query}`);
    try {
      const res = await fetch(serpUrl, { signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      serpResults = data.organic_results || [];
      fs.writeFileSync(cacheFile, JSON.stringify({ cachedAt: new Date().toISOString(), results: serpResults }, null, 2));
    } catch (err) {
      console.warn(`[serp] SerpAPI request failed: ${err.message}`);
      return [];
    }
  }

  const urls = serpResults.map((r) => r.link).filter(Boolean);
  console.log(`[serp] Processing ${urls.length} result URLs`);

  const results = [];

  for (const url of urls) {
    if (results.length >= maxLists) break;
    await sleep(500);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; wh40k-list-analyzer/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/pdf')) continue;
      const html = await res.text();
      if (html.length < 500) continue;

      const date = extractPageDate(html);
      const detectedEdition = detectEdition(date) || edition;

      const blocks = extractPreCodeBlocks(html);
      for (const block of blocks) {
        if (!isValidListBlock(block)) continue;
        results.push({
          playerName: null,
          event: null,
          date: date || null,
          record: null,
          detachment: extractDetachment(block),
          armyListText: block.slice(0, 10000),
          source: 'serp',
          sourceUrl: url,
          edition: detectedEdition,
          firstSeen: new Date().toISOString(),
        });
        if (results.length >= maxLists) break;
      }
    } catch (err) {
      console.warn(`[serp] Failed to fetch ${url}: ${err.message}`);
    }
  }

  console.log(`[serp] Got ${results.length} entries for ${faction}`);
  return results;
}

module.exports = { fetchLists };
