'use strict';

// Shared HTML/list-parsing helpers for the fetch-based crawler.
const { config } = require('../../config');
const { parseUnitsFromText } = require('../../utils');

const EDITION_CUTOFF = new Date(config.crawler.editionCutoffDate || '2025-08-01');
const MIN_UNITS = 5;
const MIN_POINTS = 500;

function detectEdition(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return (!Number.isNaN(d.getTime()) && d >= EDITION_CUTOFF) ? '11ed' : '10ed';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractTextFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractPreCodeBlocks(html) {
  const blocks = [];
  const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
  const codeRe = /<code[^>]*>([\s\S]*?)<\/code>/gi;
  let m;
  while ((m = preRe.exec(html)) !== null) blocks.push(extractTextFromHtml(m[1]));
  while ((m = codeRe.exec(html)) !== null) blocks.push(extractTextFromHtml(m[1]));
  return blocks;
}

function isValidListBlock(text) {
  const units = parseUnitsFromText(text);
  if (units.length < MIN_UNITS) return false;
  return units.reduce((s, u) => s + u.points, 0) >= MIN_POINTS;
}

// Fetch a content page and return its HTML, or null when the response is
// unusable (PDF, tiny page). Throws on network errors/timeouts.
async function fetchHtml(url, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const res = await fetchImpl(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; wh40k-list-analyzer/1.0)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/pdf')) return null;
  const text = await res.text();
  if (text.length < 500) return null;
  return text;
}

function extractPageDate(html) {
  const m = html.match(/<time[^>]*datetime="([^"]+)"/i) ||
            html.match(/"datePublished"\s*:\s*"([^"]+)"/i) ||
            html.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function extractPageTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i) ||
            html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  return m ? m[1].trim() : null;
}

module.exports = {
  detectEdition,
  sleep,
  extractPreCodeBlocks,
  isValidListBlock,
  fetchHtml,
  extractPageDate,
  extractPageTitle,
};
