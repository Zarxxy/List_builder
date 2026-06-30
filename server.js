'use strict';

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { analyzeList, SUPPORTED_FACTIONS } = require('./list-analyzer');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

function getListCount(factionKey, edition) {
  const file = path.join(__dirname, 'output', `army-lists-${factionKey}-${edition}-latest.json`);
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')).totalLists || 0; }
  catch { return 0; }
}

let factionsCache = null;
function buildFactionsCache() {
  return SUPPORTED_FACTIONS.map((f) => ({
    ...f,
    listCounts: { '11ed': getListCount(f.key, '11ed'), '10ed': getListCount(f.key, '10ed') },
  }));
}

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter: 10 req/min per IP
const rateLimitMap = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (entry.resetAt < now) rateLimitMap.delete(ip);
  }
}, 5 * 60 * 1000);

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
  if (++entry.count > 10) {
    rateLimitMap.set(ip, entry);
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  rateLimitMap.set(ip, entry);
  next();
}

app.get('/api/factions', (_req, res) => {
  if (!factionsCache) factionsCache = buildFactionsCache();
  res.json({ factions: factionsCache });
});

app.post('/api/analyze', rateLimit, async (req, res) => {
  const { listText, faction, edition = '11ed' } = req.body || {};

  if (!listText || listText.trim().length < 10)
    return res.status(400).json({ error: 'listText is required (minimum 10 characters).' });
  if (!faction)
    return res.status(400).json({ error: 'faction is required.' });
  if (!['11ed', '10ed'].includes(edition))
    return res.status(400).json({ error: 'edition must be "11ed" or "10ed".' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY is not configured on this server.' });

  try {
    const result = await analyzeList({
      listText: listText.trim(),
      faction,
      edition,
      apiKey,
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-6',
    });
    res.json(result);
  } catch (err) {
    if (err.status === 401) return res.status(401).json({ error: 'Invalid API key.' });
    if (err.status === 429) return res.status(429).json({ error: 'Claude API rate limited. Please retry shortly.' });
    console.error('[server] Analysis error:', err.message);
    res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

// JSON 404 for unmatched /api/* routes — must come before SPA catch-all
app.all('/api/*', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  factionsCache = buildFactionsCache();
  console.log(`[server] WH40K List Analyzer at http://localhost:${PORT}`);
  console.log(`[server] API key: ${process.env.ANTHROPIC_API_KEY ? 'configured' : 'MISSING'}`);
  console.log('[server] Note: restart server after running a crawl to refresh list counts.');
});

module.exports = app;
