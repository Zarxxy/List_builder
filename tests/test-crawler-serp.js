'use strict';

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { fetchLists, buildQueries, dedupeSerpResults } = require('../crawler/sources/serp');

const TEST_KEY = 'test-serpapi-key-abc123';

const serpCfg = (overrides = {}) => ({
  maxQueries: 4,
  resultsPerQuery: 10,
  maxPages: 1,
  maxUrlFetches: 25,
  siteTargets: ['goonhammer.com', 'woehammer.com'],
  skipDomains: ['reddit.com', 'youtube.com', 'facebook.com'],
  requireFactionMatch: true,
  fetchTimeoutMs: 15000,
  ...overrides,
});

// A block that passes isValidListBlock (≥5 units, ≥500pts) and mentions the faction.
const VALID_DG_LIST = [
  'Death Guard — Detachment: Plague Company',
  'Typhus [80pts]',
  'Plague Marines [100pts]',
  'Blightlord Terminators [200pts]',
  'Predator Annihilator [130pts]',
  'Plagueburst Crawler [160pts]',
].join('\n');

// Valid list shape but wrong faction — must be dropped by requireFactionMatch.
const VALID_ORKS_LIST = [
  'Orks — Detachment: War Horde',
  'Warboss [90pts]',
  'Boyz [180pts]',
  'Meganobz [210pts]',
  'Deff Dread [140pts]',
  'Battlewagon [175pts]',
].join('\n');

const INVALID_BLOCK = 'Just two units\nTyphus [80pts]\nPlague Marines [100pts]';

const FILLER = '<p>' + 'filler content to exceed the minimum page size threshold. '.repeat(20) + '</p>';

const ARTICLE_ONE_HTML = `<html><head><title>Article One GT Roundup</title></head><body>
<time datetime="2025-09-15T10:00:00Z">Sep 15</time>
<pre>${VALID_DG_LIST}</pre>
<pre>${INVALID_BLOCK}</pre>
<pre>${VALID_ORKS_LIST}</pre>
${FILLER}</body></html>`;

// No <title>, <h1>, or date anywhere — forces the SERP-result fallbacks.
const ARTICLE_TWO_HTML = `<html><body>
<pre>${VALID_DG_LIST.replace('Plague Company', 'Foetid Virion')}</pre>
${FILLER}</body></html>`;

const SERP_FIXTURE = {
  organic_results: [
    { link: 'https://example.com/article-one?utm_source=x#frag', title: 'Article One (SERP)', snippet: 's1', date: 'Sep 15, 2025' },
    { link: 'https://example.com/article-one', title: 'Duplicate of one', snippet: 's2', date: null },
    { link: 'https://www.reddit.com/r/WarhammerCompetitive/post', title: 'Reddit thread', snippet: 's3', date: null },
    { link: 'https://example.com/results.pdf', title: 'PDF results', snippet: 's4', date: null },
    { link: 'https://example.com/article-two', title: 'Article Two (SERP)', snippet: 's5', date: '2025-06-01' },
  ],
};

function mockResponse(body, { json = false } = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? (json ? 'application/json' : 'text/html') : null) },
    json: async () => body,
    text: async () => body,
  };
}

// fetchImpl serving the SerpAPI fixture and the two content pages; counts calls.
function makeFetchImpl({ failSerp = false } = {}) {
  const calls = { serp: 0, content: [] };
  const fetchImpl = async (url) => {
    if (url.startsWith('https://serpapi.com/')) {
      calls.serp++;
      if (failSerp) throw new Error(`request to ${url} failed`);
      return mockResponse(SERP_FIXTURE, { json: true });
    }
    calls.content.push(url);
    if (url === 'https://example.com/article-one') return mockResponse(ARTICLE_ONE_HTML);
    if (url === 'https://example.com/article-two') return mockResponse(ARTICLE_TWO_HTML);
    return mockResponse('short');
  };
  return { fetchImpl, calls };
}

function makeCacheDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'serp-test-'));
}

let savedKey;
beforeEach(() => {
  savedKey = process.env.SERPAPI_KEY;
  process.env.SERPAPI_KEY = TEST_KEY;
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.SERPAPI_KEY;
  else process.env.SERPAPI_KEY = savedKey;
});

// --- buildQueries ---

test('buildQueries emits generic + one query per site target', () => {
  const specs = buildQueries('Death Guard', '11ed', serpCfg());
  assert.equal(specs.length, 3);
  assert.match(specs[0].q, /"Death Guard".*"11th Edition"/);
  assert.match(specs[1].q, /^site:goonhammer\.com /);
  assert.match(specs[2].q, /^site:woehammer\.com /);
  assert.ok(specs.every((s) => s.start === 0));
});

test('buildQueries is capped at maxQueries', () => {
  const specs = buildQueries('Death Guard', '11ed', serpCfg({ maxQueries: 2 }));
  assert.equal(specs.length, 2);
});

test('buildQueries adds paginated generic queries when maxPages > 1', () => {
  const specs = buildQueries('Death Guard', '10ed', serpCfg({ maxPages: 2, maxQueries: 10 }));
  const paginated = specs.filter((s) => s.start > 0);
  assert.equal(paginated.length, 1);
  assert.equal(paginated[0].start, 10);
  assert.match(paginated[0].q, /"10th Edition"/);
});

// --- dedupeSerpResults ---

test('dedupeSerpResults strips fragments/utm params and drops duplicates, skip-domains, PDFs', () => {
  const out = dedupeSerpResults(SERP_FIXTURE.organic_results, serpCfg());
  assert.deepEqual(out.map((r) => r.link), [
    'https://example.com/article-one',
    'https://example.com/article-two',
  ]);
});

test('dedupeSerpResults respects maxUrlFetches', () => {
  const out = dedupeSerpResults(SERP_FIXTURE.organic_results, serpCfg({ maxUrlFetches: 1 }));
  assert.equal(out.length, 1);
});

test('dedupeSerpResults drops subdomains of skip domains and unparseable URLs', () => {
  const out = dedupeSerpResults([
    { link: 'https://old.reddit.com/r/x' },
    { link: 'not a url' },
    { link: 'https://example.com/ok' },
  ], serpCfg());
  assert.deepEqual(out.map((r) => r.link), ['https://example.com/ok']);
});

// --- fetchLists ---

test('fetchLists returns [] when SERPAPI_KEY is not set', async () => {
  delete process.env.SERPAPI_KEY;
  const { fetchImpl, calls } = makeFetchImpl();
  const result = await fetchLists('Death Guard', '11ed', { fetchImpl, cacheDir: makeCacheDir(), sleepMs: 0 });
  assert.deepEqual(result, []);
  assert.equal(calls.serp, 0);
});

test('fetchLists extracts valid faction-matching lists with page/SERP metadata fallbacks', async () => {
  const { fetchImpl } = makeFetchImpl();
  const result = await fetchLists('Death Guard', '11ed', { fetchImpl, cacheDir: makeCacheDir(), sleepMs: 0 });

  // article-one: DG list kept; invalid block and Orks list dropped. article-two: DG list kept.
  assert.equal(result.length, 2);

  const [one, two] = result;
  assert.equal(one.sourceUrl, 'https://example.com/article-one');
  assert.equal(one.event, 'Article One GT Roundup');       // from <title>
  assert.equal(one.date, '2025-09-15T10:00:00Z');          // from <time datetime>
  assert.equal(one.edition, '11ed');                        // ≥ 2025-08-01 cutoff
  assert.equal(one.source, 'serp');
  assert.equal(one.playerName, null);
  assert.ok(one.armyListText.includes('Plagueburst Crawler'));
  assert.ok(one.armyListText.length <= 10000);

  assert.equal(two.sourceUrl, 'https://example.com/article-two');
  assert.equal(two.event, 'Article Two (SERP)');            // fallback: SERP title
  assert.equal(two.date, '2025-06-01');                     // fallback: SERP date
  assert.equal(two.edition, '10ed');                        // < cutoff
});

test('fetchLists respects maxLists', async () => {
  const { fetchImpl } = makeFetchImpl();
  const result = await fetchLists('Death Guard', '11ed', { fetchImpl, cacheDir: makeCacheDir(), sleepMs: 0, maxLists: 1 });
  assert.equal(result.length, 1);
});

test('fetchLists never logs the API key on SerpAPI failures', async () => {
  const { fetchImpl } = makeFetchImpl({ failSerp: true });
  const warnings = [];
  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const result = await fetchLists('Death Guard', '11ed', { fetchImpl, cacheDir: makeCacheDir(), sleepMs: 0 });
    assert.deepEqual(result, []);
  } finally {
    console.warn = origWarn;
  }
  assert.ok(warnings.length > 0);
  assert.ok(warnings.every((w) => !w.includes(TEST_KEY)), 'API key leaked into a log message');
  assert.ok(warnings.some((w) => w.includes('[SERPAPI_KEY]')), 'expected scrubbed placeholder in log');
});

test('fetchLists caches SERP responses and short-circuits repeat runs', async () => {
  const cacheDir = makeCacheDir();
  const first = makeFetchImpl();
  const r1 = await fetchLists('Death Guard', '11ed', { fetchImpl: first.fetchImpl, cacheDir, sleepMs: 0 });
  assert.ok(first.calls.serp > 0);

  // Second run: any SerpAPI call would throw — results must come from cache.
  const second = makeFetchImpl({ failSerp: true });
  const r2 = await fetchLists('Death Guard', '11ed', { fetchImpl: second.fetchImpl, cacheDir, sleepMs: 0 });
  assert.equal(second.calls.serp, 0);
  assert.equal(r2.length, r1.length);
});

test('fetchLists discards v1-format cache files and re-queries', async () => {
  const cacheDir = makeCacheDir();
  fs.writeFileSync(
    path.join(cacheDir, 'serp-cache-death-guard-11ed.json'),
    JSON.stringify({ cachedAt: new Date().toISOString(), results: [] })
  );
  const { fetchImpl, calls } = makeFetchImpl();
  const result = await fetchLists('Death Guard', '11ed', { fetchImpl, cacheDir, sleepMs: 0 });
  assert.ok(calls.serp > 0, 'expected fresh SerpAPI queries despite v1 cache file');
  assert.equal(result.length, 2);
});

// --- body-text extraction ---

// ≥8 units (bodyMinUnits) with the faction on line 1 so the block passes both
// the stricter body thresholds and the faction match.
const LONG_DG_LIST = [
  'Death Guard — Detachment: Plague Company',
  'Typhus [80pts]',
  'Plague Marines [100pts]',
  'Blightlord Terminators [200pts]',
  'Predator Annihilator [130pts]',
  'Plagueburst Crawler [160pts]',
  'Deathshroud Terminators [110pts]',
  'Foul Blightspawn [60pts]',
  'Myphitic Blight-hauler [90pts]',
].join('\n');

// One-page SERP fixture + fetchImpl for a given HTML body.
function makePageFetchImpl(html) {
  const url = 'https://example.com/article';
  const fetchImpl = async (u) => {
    if (u.startsWith('https://serpapi.com/')) {
      return mockResponse({ organic_results: [{ link: url, title: 'Article (SERP)', snippet: 's', date: '2025-09-15' }] }, { json: true });
    }
    return mockResponse(html);
  };
  return fetchImpl;
}

test('fetchLists extracts lists from article body text (no <pre>/<code>)', async () => {
  const html = `<html><head><title>Body Only GT Report</title></head><body>
    <h2>The list</h2>
    <p>${LONG_DG_LIST.split('\n').join('<br>')}</p>
    ${FILLER}</body></html>`;
  const result = await fetchLists('Death Guard', '11ed', {
    fetchImpl: makePageFetchImpl(html), cacheDir: makeCacheDir(), sleepMs: 0,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].event, 'Body Only GT Report');
  assert.ok(result[0].armyListText.includes('Myphitic Blight-hauler'));
  assert.equal(result[0].detachment, 'Plague Company');
});

test('fetchLists keeps one copy when the same list appears in <pre> and body text', async () => {
  const html = `<html><head><title>Duplicated List Page</title></head><body>
    <pre>${LONG_DG_LIST}</pre>
    <p>${LONG_DG_LIST.split('\n').join('<br>')}</p>
    ${FILLER}</body></html>`;
  const result = await fetchLists('Death Guard', '11ed', {
    fetchImpl: makePageFetchImpl(html), cacheDir: makeCacheDir(), sleepMs: 0,
  });
  assert.equal(result.length, 1);
});

test('fetchLists ignores body prose that fails the density check', async () => {
  const prose = Array.from({ length: 40 }, (_, i) => `Turn commentary line ${i} about positioning and secondaries.`).join('<br>');
  const html = `<html><head><title>Prose Report</title></head><body>
    <p>Death Guard did well this weekend.<br>${prose}<br>${LONG_DG_LIST.split('\n').slice(1).join('<br>')}</p>
    ${FILLER}</body></html>`;
  const result = await fetchLists('Death Guard', '11ed', {
    fetchImpl: makePageFetchImpl(html), cacheDir: makeCacheDir(), sleepMs: 0,
  });
  assert.deepEqual(result, []);
});

test('fetchLists expires cache entries past the TTL', async () => {
  const cacheDir = makeCacheDir();
  const first = makeFetchImpl();
  await fetchLists('Death Guard', '11ed', { fetchImpl: first.fetchImpl, cacheDir, sleepMs: 0 });

  // 30 days later the cache (TTL 7d) must be stale.
  const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const second = makeFetchImpl();
  await fetchLists('Death Guard', '11ed', { fetchImpl: second.fetchImpl, cacheDir, sleepMs: 0, now: future });
  assert.ok(second.calls.serp > 0, 'expected re-query after TTL expiry');
});
