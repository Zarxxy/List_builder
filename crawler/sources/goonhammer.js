'use strict';

const { extractDetachment } = require('../../utils');
const { detectEdition, sleep, extractPreCodeBlocks, isValidListBlock } = require('../lib/html');

function extractArticleLinks(html) {
  const links = [];
  const re = /<a\s+[^>]*href="(https?:\/\/www\.goonhammer\.com\/[^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    if (!links.includes(url) && !url.includes('#') && !url.includes('?s=')) {
      links.push(url);
    }
  }
  return links;
}

function extractArticleDate(html) {
  const m = html.match(/<time[^>]*datetime="([^"]+)"/i) ||
            html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
  return m ? m[1] : null;
}

function extractArticleTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i) ||
            html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return m ? m[1].trim() : null;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; wh40k-list-analyzer/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(15000),
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/pdf')) return null;
  const text = await res.text();
  if (text.length < 500) return null;
  return text;
}

async function fetchLists(faction, edition, opts = {}) {
  const { maxLists = 50 } = opts;
  const results = [];

  const searchUrl = `https://www.goonhammer.com/?s=${encodeURIComponent(faction)}+tournament`;
  console.log(`[goonhammer] Searching: ${searchUrl}`);

  let searchHtml;
  try {
    searchHtml = await fetchHtml(searchUrl);
  } catch (err) {
    console.warn(`[goonhammer] Search failed: ${err.message}`);
    return [];
  }
  if (!searchHtml) return [];

  const articleLinks = extractArticleLinks(searchHtml).slice(0, 5);
  console.log(`[goonhammer] Found ${articleLinks.length} article links`);

  for (const articleUrl of articleLinks) {
    if (results.length >= maxLists) break;
    await sleep(1000);

    let html;
    try {
      html = await fetchHtml(articleUrl);
    } catch (err) {
      console.warn(`[goonhammer] Failed to fetch ${articleUrl}: ${err.message}`);
      continue;
    }
    if (!html) continue;

    const date = extractArticleDate(html);
    const title = extractArticleTitle(html);
    const detectedEdition = detectEdition(date) || edition;

    // Extract from <pre> and <code> first (most reliable)
    const blocks = extractPreCodeBlocks(html);
    for (const block of blocks) {
      if (results.length >= maxLists) break;
      if (isValidListBlock(block)) {
        results.push({
          playerName: null,
          event: title || null,
          date: date || null,
          record: null,
          detachment: extractDetachment(block),
          armyListText: block.slice(0, 10000),
          source: 'goonhammer',
          sourceUrl: articleUrl,
          edition: detectedEdition,
          firstSeen: new Date().toISOString(),
        });
      }
    }
  }

  console.log(`[goonhammer] Got ${results.length} entries for ${faction}`);
  return results;
}

module.exports = { fetchLists };
