'use strict';

// BCP requires login for list access. DISABLED by default (ToS risk).
// Enable by adding 'bcp' to enabledSources in config.json.

function createFetcher(browser) {
  return async function fetchLists(faction, edition, opts = {}) {
    const { maxLists = 50, timeout = 60000 } = opts;
    const results = [];

    const page = await browser.newPage();
    try {
      // BCP requires authentication — stub only; replace with real login flow
      await page.goto('https://www.bestcoastpairings.com', { timeout });
      // Login and navigate to tournament lists here if credentials are provided
      console.log('[bcp] BCP requires login — no public list access. Returning empty.');
    } catch (err) {
      console.warn(`[bcp] Error: ${err.message}`);
    } finally {
      await page.close();
    }

    return results;
  };
}

module.exports = { createFetcher };
