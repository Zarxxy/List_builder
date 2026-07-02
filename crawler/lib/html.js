'use strict';

// Shared HTML/list-parsing helpers for the fetch-based crawler sources
// (serp, goonhammer). Previously these were copy-pasted into each source file.
const config = require('../../config.json');
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

module.exports = {
  EDITION_CUTOFF,
  MIN_UNITS,
  MIN_POINTS,
  detectEdition,
  sleep,
  extractTextFromHtml,
  extractPreCodeBlocks,
  isValidListBlock,
};
