'use strict';

const { extractDetachment, parseUnitsFromText } = require('../../utils');

const BASE_URL = 'https://listhammer.info';
const EDITION_CUTOFF = new Date('2025-08-01');

function detectEdition(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d >= EDITION_CUTOFF ? '11ed' : '10ed';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchLists(faction, edition, opts = {}) {
  const { maxLists = 50, timeout = 60000, browser } = opts;
  if (!browser) throw new Error('listhammer.js requires a Playwright browser instance');

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();
  const results = [];

  try {
    const params = new URLSearchParams({ faction });
    const url = `${BASE_URL}/?${params}`;
    console.log(`[listhammer] Fetching: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle', timeout });
    await sleep(3000);

    // Wait for Cloudflare challenge if present
    const hasChallenge = await page.evaluate(() =>
      document.body?.innerText?.includes('Checking your browser') ||
      document.body?.innerText?.includes('Just a moment') ||
      !!document.querySelector('#challenge-form')
    );
    if (hasChallenge) {
      console.log('[listhammer] Cloudflare challenge detected, waiting 10s...');
      await sleep(10000);
    }

    // Scroll to load lazy content
    await page.evaluate(() => window.scrollTo(0, 300));
    await sleep(1500);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);

    const rawEntries = await page.evaluate(() => {
      const entries = [];

      // Strategy 1: Nuxt SSR payload
      const nuxtScript = document.querySelector('script#__NUXT_DATA__[type="application/json"]');
      if (nuxtScript) {
        try {
          const nuxtRaw = JSON.parse(nuxtScript.textContent);
          if (Array.isArray(nuxtRaw)) {
            for (const item of nuxtRaw) {
              if (item && typeof item === 'object' && !Array.isArray(item)) {
                const keys = Object.keys(item);
                const hasPlayer = keys.some((k) => /player|name|author/i.test(k));
                const hasFaction = keys.some((k) => /faction|army/i.test(k));
                if (hasPlayer && hasFaction) {
                  const pk = keys.find((k) => /^player/i.test(k)) || keys.find((k) => /name/i.test(k));
                  const fk = keys.find((k) => /faction/i.test(k)) || keys.find((k) => /army/i.test(k));
                  const dk = keys.find((k) => /detachment/i.test(k));
                  const ek = keys.find((k) => /event|tournament/i.test(k));
                  const rk = keys.find((k) => /record|result|score/i.test(k));
                  const dtk = keys.find((k) => /date/i.test(k));
                  const lk = keys.find((k) => /list|roster|army.?list/i.test(k));
                  entries.push({
                    playerName: pk ? String(item[pk]) : null,
                    faction: fk ? String(item[fk]) : null,
                    detachment: dk ? String(item[dk]) : null,
                    event: ek ? String(item[ek]) : null,
                    record: rk ? String(item[rk]) : null,
                    date: dtk ? String(item[dtk]) : null,
                    armyListText: lk ? String(item[lk]) : null,
                  });
                }
              }
            }
          }
        } catch {}
      }
      if (entries.length > 0) return entries;

      // Strategy 2: Table rows
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const headerCells = table.querySelectorAll('thead th, tr:first-child th');
        const colMap = {};
        headerCells.forEach((th, i) => {
          const t = th.textContent.trim().toLowerCase();
          if (/^name|player/.test(t)) colMap.playerName = i;
          else if (/faction|army/.test(t)) colMap.faction = i;
          else if (/detachment/.test(t)) colMap.detachment = i;
          else if (/event|tournament/.test(t)) colMap.event = i;
          else if (/result|record|score/.test(t)) colMap.record = i;
          else if (/date/.test(t)) colMap.date = i;
        });
        const rows = table.querySelectorAll('tbody tr');
        for (const row of rows) {
          const cells = [...row.querySelectorAll('td')];
          if (cells.length < 2) continue;
          const link = row.querySelector('a[href]');
          const cellTexts = cells.map((c) => c.textContent.trim());
          entries.push({
            playerName: colMap.playerName !== undefined ? (cellTexts[colMap.playerName] || null) : (cellTexts[0] || null),
            faction: colMap.faction !== undefined ? (cellTexts[colMap.faction] || null) : null,
            detachment: colMap.detachment !== undefined ? (cellTexts[colMap.detachment] || null) : null,
            event: colMap.event !== undefined ? (cellTexts[colMap.event] || null) : null,
            record: colMap.record !== undefined ? (cellTexts[colMap.record] || null) : null,
            date: colMap.date !== undefined ? (cellTexts[colMap.date] || null) : null,
            detailUrl: link ? link.href : null,
          });
        }
      }
      return entries;
    });

    // Expand rows to get army list text
    let count = 0;
    for (let i = 0; i < rawEntries.length && count < maxLists; i++) {
      const entry = rawEntries[i];
      let armyText = entry.armyListText || null;

      if (!armyText) {
        armyText = await expandRow(page, i).catch(() => null);
      }

      if (!armyText && entry.detailUrl) {
        armyText = await fetchDetailPage(page, entry.detailUrl, timeout).catch(() => null);
      }

      const detectedEdition = detectEdition(entry.date) || edition;
      results.push({
        playerName: entry.playerName || null,
        event: entry.event || null,
        date: entry.date || null,
        record: entry.record || null,
        detachment: entry.detachment || (armyText ? extractDetachment(armyText) : null),
        armyListText: armyText || '',
        source: 'listhammer',
        sourceUrl: entry.detailUrl || url,
        edition: detectedEdition,
        firstSeen: new Date().toISOString(),
      });
      count++;
    }

    console.log(`[listhammer] Got ${results.length} entries for ${faction}`);
  } finally {
    await context.close();
  }

  return results.filter((r) => r.armyListText.length > 50);
}

async function expandRow(page, rowIndex) {
  const clicked = await page.evaluate((idx) => {
    const table = document.querySelector('table');
    if (!table) return false;
    const rows = [...table.querySelectorAll('tbody tr, tr')].filter((row) => {
      if (row.closest('thead')) return false;
      const cells = row.querySelectorAll('td');
      if (cells.length === 1 && cells[0].colSpan > 1) return false;
      return cells.length >= 2;
    });
    if (idx >= rows.length) return false;
    const row = rows[idx];
    const btn = row.querySelector('button, [class*="expand"], [class*="toggle"], details summary');
    if (btn) { btn.click(); return true; }
    row.click();
    return true;
  }, rowIndex);

  if (!clicked) return null;
  await new Promise((r) => setTimeout(r, 800));

  return page.evaluate((idx) => {
    const table = document.querySelector('table');
    if (!table) return null;
    const allRows = [...table.querySelectorAll('tbody tr, tr')];
    const dataRows = [];
    for (let ri = 0; ri < allRows.length; ri++) {
      const row = allRows[ri];
      if (row.closest('thead')) continue;
      const cells = row.querySelectorAll('td');
      if (cells.length === 1 && cells[0].colSpan > 1) continue;
      if (cells.length < 2) continue;
      dataRows.push({ row, ri });
    }
    if (idx >= dataRows.length) return null;
    const targetRi = dataRows[idx].ri;
    for (let i = targetRi + 1; i < allRows.length && i <= targetRi + 3; i++) {
      const text = allRows[i].textContent.trim();
      if (text.length > 50 && (text.includes('pts') || text.includes('Detachment'))) {
        return text.slice(0, 10000);
      }
    }
    const expanded = document.querySelector('.expanded-content, [class*="army-list"], pre, code');
    if (expanded) {
      const t = expanded.textContent.trim();
      if (t.length > 50 && (t.includes('pts') || t.includes('Detachment'))) return t.slice(0, 10000);
    }
    return null;
  }, rowIndex);
}

async function fetchDetailPage(page, url, timeout) {
  const prev = page.url();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));
    const text = await page.evaluate(() => {
      const el = document.querySelector('pre, code, .army-list-text, [class*="list-content"]');
      if (el) return el.textContent.trim();
      const body = document.body?.innerText || '';
      if (body.includes('pts') && body.includes('Detachment')) return body.slice(0, 10000);
      return null;
    });
    await page.goto(prev, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    return text;
  } catch {
    await page.goto(prev, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
    return null;
  }
}

module.exports = { fetchLists };
