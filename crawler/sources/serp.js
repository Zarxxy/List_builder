'use strict';

// SerpAPI-driven information gathering — the crawler's only data source.
// SerpAPI (Google Search) handles all discovery via a small, capped set of
// query variants (generic + site-targeted); discovered pages are then fetched
// with plain HTTP and army lists extracted from <pre>/<code> blocks.
// Every query spec is one billable SerpAPI search — `serp.maxQueries` in
// config.json is the hard cost ceiling, and responses are cached per query
// for `serpCacheTTLDays`.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractDetachment } = require('../../utils');
const config = require('../../config.json');
const {
  detectEdition, sleep, extractPreCodeBlocks, isValidListBlock,
  fetchHtml, extractPageDate, extractPageTitle,
} = require('../lib/html');

const CACHE_TTL_DAYS = config.crawler.serpCacheTTLDays || 7;
const CACHE_VERSION = 2;
const OUTPUT_DIR = path.join(__dirname, '..', '..', 'output');

const SERP_DEFAULTS = {
  maxQueries: 4,
  resultsPerQuery: 10,
  maxPages: 1,
  maxUrlFetches: 25,
  siteTargets: ['goonhammer.com', 'woehammer.com'],
  skipDomains: ['reddit.com', 'youtube.com', 'facebook.com'],
  requireFactionMatch: true,
  fetchTimeoutMs: 15000,
};

function serpConfig() {
  return { ...SERP_DEFAULTS, ...(config.crawler.serp || {}) };
}

// One spec per billable SerpAPI search: generic query, one per site target,
// then optional extra result pages of the generic query — truncated to
// maxQueries so config alone bounds the API spend.
function buildQueries(faction, edition, serpCfg = serpConfig()) {
  const editionLabel = edition === '11ed' ? '11th Edition' : '10th Edition';
  const num = serpCfg.resultsPerQuery;
  const generic = `"${faction}" tournament army list warhammer 40k "${editionLabel}"`;

  const specs = [{ q: generic, num, start: 0 }];
  for (const domain of serpCfg.siteTargets) {
    specs.push({ q: `site:${domain} "${faction}" tournament list`, num, start: 0 });
  }
  for (let page = 1; page < serpCfg.maxPages; page++) {
    specs.push({ q: generic, num, start: num * page });
  }
  return specs.slice(0, serpCfg.maxQueries);
}

function querySpecKey(spec) {
  return crypto.createHash('sha256').update(`${spec.q}|${spec.num}|${spec.start}`).digest('hex').slice(0, 16);
}

function loadCache(cacheFile) {
  try {
    const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
    if (cached.version === CACHE_VERSION && cached.queries) return cached;
  } catch {}
  return { version: CACHE_VERSION, queries: {} };
}

function normalizeUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_')) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return null;
  }
}

// Merge organic results from all queries into a deduped, filtered URL list.
function dedupeSerpResults(results, serpCfg = serpConfig()) {
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const url = normalizeUrl(r.link);
    if (!url || seen.has(url)) continue;
    const { hostname, pathname } = new URL(url);
    if (serpCfg.skipDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) continue;
    if (pathname.toLowerCase().endsWith('.pdf')) continue;
    seen.add(url);
    out.push({ ...r, link: url });
    if (out.length >= serpCfg.maxUrlFetches) break;
  }
  return out;
}

function factionMatcher(faction) {
  const patterns = config.factionPatterns[faction] ||
    [faction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')];
  const regexes = patterns.map((p) => new RegExp(p, 'i'));
  return (text) => regexes.some((re) => re.test(text));
}

async function fetchLists(faction, edition, opts = {}) {
  const {
    maxLists = 50,
    fetchImpl = fetch,
    cacheDir = OUTPUT_DIR,
    now = () => new Date(),
    sleepMs = 500,
  } = opts;
  const serpCfg = serpConfig();

  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    console.warn('[serp] SERPAPI_KEY not set — skipping SerpAPI source');
    return [];
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const factionKey = faction.replace(/\s+/g, '-').toLowerCase();
  const cacheFile = path.join(cacheDir, `serp-cache-${factionKey}-${edition}.json`);
  const cache = loadCache(cacheFile);

  // --- Search phase: one SerpAPI call per uncached query spec ---
  const specs = buildQueries(faction, edition, serpCfg);
  const serpResults = [];
  let cacheDirty = false;

  for (const spec of specs) {
    const key = querySpecKey(spec);
    const entry = cache.queries[key];
    if (entry) {
      const ageDays = (now().getTime() - new Date(entry.cachedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < CACHE_TTL_DAYS) {
        console.log(`[serp] Using cached results for query "${spec.q}" (${ageDays.toFixed(1)} days old)`);
        serpResults.push(...entry.results);
        continue;
      }
    }

    const params = new URLSearchParams({
      engine: 'google',
      q: spec.q,
      num: String(spec.num),
      api_key: apiKey,
    });
    if (spec.start > 0) params.set('start', String(spec.start));
    console.log(`[serp] Querying SerpAPI: ${spec.q}`);
    try {
      const res = await fetchImpl(`https://serpapi.com/search.json?${params}`, {
        signal: AbortSignal.timeout(serpCfg.fetchTimeoutMs),
      });
      if (!res.ok) throw new Error(`SerpAPI responded with HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(`SerpAPI error: ${data.error}`);
      const results = (data.organic_results || []).map((r) => ({
        link: r.link, title: r.title, snippet: r.snippet, date: r.date,
      }));
      serpResults.push(...results);
      cache.queries[key] = { cachedAt: now().toISOString(), query: spec, results };
      cacheDirty = true;
    } catch (err) {
      // Never echo the request URL/key into logs
      const msg = String(err.message).split(apiKey).join('[SERPAPI_KEY]');
      console.warn(`[serp] SerpAPI request failed for "${spec.q}": ${msg}`);
    }
  }

  if (cacheDirty) {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  // --- Extraction phase: fetch discovered pages, pull validated list blocks ---
  const candidates = dedupeSerpResults(serpResults, serpCfg);
  console.log(`[serp] Processing ${candidates.length} result URLs`);

  const matchesFaction = factionMatcher(faction);
  const results = [];

  for (const candidate of candidates) {
    if (results.length >= maxLists) break;
    if (sleepMs > 0) await sleep(sleepMs);

    let html;
    try {
      html = await fetchHtml(candidate.link, { fetchImpl, timeoutMs: serpCfg.fetchTimeoutMs });
    } catch (err) {
      console.warn(`[serp] Failed to fetch ${candidate.link}: ${err.message}`);
      continue;
    }
    if (!html) continue;

    const date = extractPageDate(html) || candidate.date || null;
    const detectedEdition = detectEdition(date) || edition;
    const event = extractPageTitle(html) || candidate.title || null;

    for (const block of extractPreCodeBlocks(html)) {
      if (!isValidListBlock(block)) continue;
      // SERP surfaces multi-faction roundup articles; keep only blocks that
      // actually mention the requested faction.
      if (serpCfg.requireFactionMatch && !matchesFaction(block)) continue;
      results.push({
        playerName: null,
        event,
        date,
        record: null,
        detachment: extractDetachment(block),
        armyListText: block.slice(0, 10000),
        source: 'serp',
        sourceUrl: candidate.link,
        edition: detectedEdition,
        firstSeen: now().toISOString(),
      });
      if (results.length >= maxLists) break;
    }
  }

  console.log(`[serp] Got ${results.length} entries for ${faction}`);
  return results;
}

module.exports = { fetchLists, buildQueries, dedupeSerpResults };
