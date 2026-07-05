'use strict';

// Shared HTML/list-parsing helpers for the fetch-based crawler.
const { config } = require('../../config');
const { parseUnitsFromText } = require('../../utils');

const EDITION_CUTOFF = new Date(config.crawler.editionCutoffDate || '2025-08-01');

// Body-text segments outside these bounds are noise (nav fragments) or whole
// page dumps, not individual army lists.
const BODY_SEGMENT_MIN_CHARS = 80;
const BODY_SEGMENT_MAX_CHARS = 15000;

// Validation thresholds, overridable via config.crawler.validation. The
// body* values are stricter because article body text is far noisier than
// <pre>/<code> blocks — see extractBodyTextBlocks.
function validationConfig() {
  const v = (config.crawler && config.crawler.validation) || {};
  return {
    minUnits: v.minUnits || 5,
    minPoints: v.minPoints || 500,
    bodyMinUnits: v.bodyMinUnits || 8,
    bodyMinUnitDensity: v.bodyMinUnitDensity || 0.3,
  };
}

function detectEdition(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return (!Number.isNaN(d.getTime()) && d >= EDITION_CUTOFF) ? '11ed' : '10ed';
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// HTML → text, preserving line structure: unit parsing in
// shared/list-summary.js is line-anchored, so <br>-separated lists must come
// out one unit per line, not merged into a single line.
function extractTextFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n').map((line) => line.trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const PRE_RE = /<pre[^>]*>([\s\S]*?)<\/pre>/gi;
const CODE_RE = /<code[^>]*>([\s\S]*?)<\/code>/gi;

function extractPreCodeBlocks(html) {
  const blocks = [];
  let m;
  PRE_RE.lastIndex = 0;
  CODE_RE.lastIndex = 0;
  while ((m = PRE_RE.exec(html)) !== null) blocks.push(extractTextFromHtml(m[1]));
  while ((m = CODE_RE.exec(html)) !== null) blocks.push(extractTextFromHtml(m[1]));
  return blocks;
}

// Candidate list blocks from article body text (everything OUTSIDE
// <pre>/<code>, which extractPreCodeBlocks already covers). Many sites render
// lists as <p>/<br>/table markup; segment the page text at headings and blank
// lines and let the caller validate each segment with the stricter body
// thresholds.
function extractBodyTextBlocks(html) {
  const withoutPreCode = html
    .replace(PRE_RE, '\n\n')
    .replace(CODE_RE, '\n\n')
    // Heading openings start a new segment (their closers become newlines in
    // extractTextFromHtml, giving the blank-line separator).
    .replace(/<h[1-6][^>]*>/gi, '\n\n$&');
  return extractTextFromHtml(withoutPreCode)
    .split(/\n{2,}/)
    .map((seg) => seg.trim())
    .filter((seg) => seg.length >= BODY_SEGMENT_MIN_CHARS && seg.length <= BODY_SEGMENT_MAX_CHARS);
}

// minUnitDensity (parsed units ÷ non-empty lines) is 0 by default — prose
// filtering only makes sense for body-text segments, not <pre> blocks.
function isValidListBlock(text, { minUnits = 5, minPoints = 500, minUnitDensity = 0 } = {}) {
  const units = parseUnitsFromText(text);
  if (units.length < minUnits) return false;
  if (units.reduce((s, u) => s + u.points, 0) < minPoints) return false;
  if (minUnitDensity > 0) {
    const lines = text.split('\n').filter((l) => l.trim()).length;
    if (lines > 0 && units.length / lines < minUnitDensity) return false;
  }
  return true;
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
  validationConfig,
  extractPreCodeBlocks,
  extractBodyTextBlocks,
  isValidListBlock,
  fetchHtml,
  extractPageDate,
  extractPageTitle,
};
