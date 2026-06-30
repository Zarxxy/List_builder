'use strict';

const { extractDetachment } = require('../../utils');

// Tabletop.to scraping may violate Terms of Service. DISABLED by default.
// Enable by adding 'tabletop-to' to enabledSources in config.json.

function createFetcher(browser) {
  return async function fetchLists(faction, edition, opts = {}) {
    const { maxLists = 50, timeout = 60000 } = opts;
    const results = [];

    const page = await browser.newPage();
    try {
      const url = `https://tabletop.to/warhammer-40000?faction=${encodeURIComponent(faction)}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout });
      await new Promise((r) => setTimeout(r, 3000));

      const entries = await page.evaluate(() => {
        const items = [];
        const cards = document.querySelectorAll('.list-entry, .army-card, article, [class*="list-item"]');
        for (const card of cards) {
          const pre = card.querySelector('pre, code');
          items.push({
            armyListText: pre ? pre.textContent.trim() : null,
            event: card.querySelector('.event, [class*="event"]')?.textContent.trim() || null,
            date: card.querySelector('time, [class*="date"]')?.getAttribute('datetime') || null,
            playerName: card.querySelector('.player, [class*="player"]')?.textContent.trim() || null,
            record: card.querySelector('.record, [class*="record"]')?.textContent.trim() || null,
          });
        }
        return items;
      });

      for (const e of entries.slice(0, maxLists)) {
        if (e.armyListText && e.armyListText.length > 50) {
          results.push({
            playerName: e.playerName || null,
            event: e.event || null,
            date: e.date || null,
            record: e.record || null,
            detachment: extractDetachment(e.armyListText),
            armyListText: e.armyListText,
            source: 'tabletop-to',
            sourceUrl: url,
            edition,
            firstSeen: new Date().toISOString(),
          });
        }
      }
    } catch (err) {
      console.warn(`[tabletop-to] Error: ${err.message}`);
    } finally {
      await page.close();
    }

    console.log(`[tabletop-to] Got ${results.length} entries for ${faction}`);
    return results;
  };
}

module.exports = { createFetcher };
