// End-to-end smoke test for the GENERATED docs page (docs/index.html), run in a
// real headless Chromium. Covers what the Node unit tests cannot: that the
// inlined shared modules + UI actually load, wire up, and — critically — that
// model output is escaped in a live DOM (the XSS guarantee, end to end).
//
// Uses the preinstalled Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
// Do NOT run `playwright install`. Invoke via `npm run test:e2e`.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const docsUrl = pathToFileURL(path.join(rootDir, 'docs', 'index.html')).href;

// The preinstalled Chromium may be a different revision than the playwright
// package expects, so point executablePath at the actual binary rather than
// relying on playwright's version-pinned resolution.
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium-') && !d.includes('headless'));
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined; // fall back to playwright's default resolution
}

let browser;

before(async () => {
  browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
});

after(async () => { if (browser) await browser.close(); });

// Canned analysis whose recommendation carries an XSS payload. If escaping
// regresses, the injected <img> fires onerror and sets window.__xss.
const cannedAnalysis = {
  score: 7,
  score_label: 'Competitive',
  detachment_analysis: 'Solid detachment usage.',
  meta_explanation: 'Meta context here.',
  strengths: ['Good board control', 'Strong anti-tank', 'Flexible scoring'],
  weaknesses: ['Light on bodies', 'Few answers to fliers', 'Fragile characters'],
  comparison_points: ['Runs fewer Plague Marines than meta', 'Similar HQ core', 'Less durable'],
  recommendations: ['<img src=x onerror="window.__xss=1">', 'Add screening units', 'Tighten the list'],
  verdict: 'A competitive list with clear improvement paths.',
};

test('generated docs page loads, populates factions, and renders without uncaught errors', async () => {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(docsUrl, { waitUntil: 'load' });
  // init() runs async; wait for the faction <select> to be filled.
  await page.waitForFunction(() => document.getElementById('factionSelect').options.length > 0);

  const optionCount = await page.$eval('#factionSelect', (el) => el.options.length);
  assert.equal(optionCount, 26, 'expected all 26 factions in the dropdown');
  assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors.join('; ')}`);

  await page.close();
});

test('model output is escaped end-to-end (XSS payload stays inert)', async () => {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Stub the Anthropic call with our canned (malicious) analysis.
  await page.route('**/api.anthropic.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(cannedAnalysis) }] }),
    }),
  );

  await page.goto(docsUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('factionSelect').options.length > 0);

  // Provide an API key (session storage) and a list, then analyze.
  await page.evaluate(() => sessionStorage.setItem('anthropic_key', 'sk-ant-test-key'));
  await page.fill('#listText', 'Detachment: Plague Company\nPlague Marines [100pts]\nPlague Marines [100pts]');
  await page.dispatchEvent('#listText', 'input');
  await page.click('#analyzeBtn');

  // Results should appear.
  await page.waitForSelector('#results', { state: 'visible' });

  // The payload must be inert: no <img> injected, onerror never ran.
  const injectedImgs = await page.locator('#recommendations img').count();
  const xssFired = await page.evaluate(() => window.__xss);
  const recHtml = await page.$eval('#recommendations', (el) => el.innerHTML);

  assert.equal(injectedImgs, 0, 'recommendation injected a live <img> element (XSS!)');
  assert.equal(xssFired, undefined, 'onerror executed — escaping regressed (XSS!)');
  assert.ok(recHtml.includes('&lt;img'), 'payload was not HTML-escaped in the DOM');
  assert.deepEqual(pageErrors, [], `uncaught page errors: ${pageErrors.join('; ')}`);

  await page.close();
});
