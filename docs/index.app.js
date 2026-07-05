'use strict';

// UI for the static GitHub Pages build — calls api.anthropic.com directly with
// a user-supplied session key. This file is inlined into docs/index.html by
// build-pages.js AFTER the shared modules bundle, so the shared helpers below
// (and the build-config consts MODEL_ID / MAX_TOKENS emitted by the bundle
// prelude) are in scope as plain script globals.
/* global SUPPORTED_FACTIONS, getMockData, summarizeList, renderListSummaryHtml,
          renderAnalysisHtml, buildSystemText, buildUserMessage, extractJSON,
          buildContextFromOutput, outputBasename, MODEL_ID, MAX_TOKENS */

// ── STATE ────────────────────────────────────────────────────────────────────
let factionsWithRealData = new Set();

const factionSelect = document.getElementById('factionSelect');
const listTextEl    = document.getElementById('listText');
const analyzeBtn    = document.getElementById('analyzeBtn');
const listSummaryEl = document.getElementById('listSummary');
const resultsEl     = document.getElementById('results');
const spinnerEl     = document.getElementById('spinner');
const errorBox      = document.getElementById('errorBox');
const apiKeyStatus  = document.getElementById('apiKeyStatus');
const settingsModal = document.getElementById('settingsModal');
const apiKeyInput   = document.getElementById('apiKeyInput');

// ── INIT ─────────────────────────────────────────────────────────────────────
(async function init() {
  // Load manifest to find factions with live crawled data
  try {
    const m = await fetch('./data/manifest.json').then((r) => r.json());
    (m.files || []).forEach((f) => {
      const match = f.match(/army-lists-(.+)-(10ed|11ed)-latest\.json/);
      if (match) factionsWithRealData.add(`${match[1]}:${match[2]}`);
    });
  } catch { /* no manifest — all factions use mock data */ }

  buildFactionSelect();
  updateApiKeyStatus();

  factionSelect.addEventListener('change', checkReady);
  listTextEl.addEventListener('input', () => { checkReady(); refreshSummary(); });
  document.querySelectorAll('input[name="edition"]').forEach((r) => {
    r.addEventListener('change', () => { buildFactionSelect(); checkReady(); });
  });
})();

function getEdition() {
  return document.querySelector('input[name="edition"]:checked').value;
}

function buildFactionSelect() {
  const edition = getEdition();
  const current = factionSelect.value;
  factionSelect.innerHTML = '';
  for (const f of SUPPORTED_FACTIONS) {
    const hasLive = factionsWithRealData.has(`${f.key}:${edition}`);
    const ctx = getMockData(f.key, edition);
    const listCount = hasLive ? '(live data)' : (ctx ? `(${ctx.meta.totalLists} lists — meta snapshot)` : '(no data)');
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = `${f.label} ${listCount}`;
    factionSelect.appendChild(opt);
  }
  if (current) factionSelect.value = current;
}

function checkReady() {
  const hasKey = !!sessionStorage.getItem('anthropic_key');
  const hasFaction = !!factionSelect.value;
  const hasText = listTextEl.value.trim().length >= 10;
  analyzeBtn.disabled = !(hasKey && hasFaction && hasText);
  if (!hasKey) analyzeBtn.textContent = 'Enter API key in settings ⚙';
  else analyzeBtn.textContent = 'Analyze List';
}

// Live pre-flight summary: what the parser sees, before any API tokens are spent.
function refreshSummary() {
  const summary = summarizeList(listTextEl.value);
  listSummaryEl.innerHTML = renderListSummaryHtml(summary);
  listSummaryEl.style.display = summary ? 'block' : 'none';
}

function updateApiKeyStatus() {
  const hasKey = !!sessionStorage.getItem('anthropic_key');
  apiKeyStatus.textContent = hasKey ? '✓ API key saved for this session' : 'No API key — click ⚙ to add one';
  apiKeyStatus.style.color = hasKey ? '#56d364' : '#f0a32e';
  checkReady();
}

// ── SETTINGS MODAL ───────────────────────────────────────────────────────────
function openSettings() {
  const k = sessionStorage.getItem('anthropic_key') || '';
  apiKeyInput.value = k ? '••••••••••' + k.slice(-4) : '';
  settingsModal.classList.add('open');
}
function closeSettings() { settingsModal.classList.remove('open'); }
function saveKey() {
  const v = apiKeyInput.value.trim();
  if (v && !v.startsWith('••')) {
    sessionStorage.setItem('anthropic_key', v);
    updateApiKeyStatus();
  }
  closeSettings();
}
function clearKey() {
  sessionStorage.removeItem('anthropic_key');
  apiKeyInput.value = '';
  updateApiKeyStatus();
  closeSettings();
}

// ── ANALYZE ──────────────────────────────────────────────────────────────────

// Tournament context for the prompt: a live crawl artifact (normalized through
// the shared buildContextFromOutput, same as the Node server path) when one is
// deployed and fetchable, otherwise the mock snapshot. isMockData is derived
// from the context actually used — a failed data fetch falls back to mock and
// must be labeled as such.
//
// Live contexts are memoized: the data file is an immutable deploy asset, so
// re-fetching and re-parsing it on every Analyze click is pure waste. The mock
// fallback is deliberately NOT cached — a transient fetch failure must not
// downgrade the rest of the session to mock data.
const liveContextCache = new Map();
async function loadContext(factionKey, edition) {
  const key = `${factionKey}:${edition}`;
  if (factionsWithRealData.has(key)) {
    if (liveContextCache.has(key)) return liveContextCache.get(key);
    try {
      const raw = await fetch(`./data/${outputBasename(factionKey, edition)}`).then((r) => r.json());
      const context = buildContextFromOutput(raw);
      liveContextCache.set(key, context);
      return context;
    } catch { /* fall through to mock */ }
  }
  return getMockData(factionKey, edition);
}

async function analyze() {
  const apiKey = sessionStorage.getItem('anthropic_key');
  if (!apiKey) { showError('Enter your Anthropic API key in settings ⚙'); return; }

  const factionKey = factionSelect.value;
  const edition    = getEdition();
  const listText   = listTextEl.value.trim();
  if (!listText || listText.length < 10) { showError('Please paste your army list before analyzing.'); return; }

  const context = await loadContext(factionKey, edition);
  const isMockData = !context || context.isMockData === true;

  const systemPrompt = buildSystemText(factionKey, edition);
  const userMessage  = buildUserMessage(listText, factionKey, edition, context);

  setLoading(true);
  hideError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: systemPrompt }],
        messages: [{ role: 'user', content: userMessage }],
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) return showError('Invalid API key — check your key in ⚙ settings.');
      if (res.status === 429) return showError('Rate limited by Anthropic. Please wait a moment.');
      return showError(err.error?.message || `API error ${res.status}`);
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text || '';
    const result = extractJSON(raw);
    if (!result) return showError('Could not parse the analysis response. Please try again.');
    if (!Number.isFinite(Number(result.score))) {
      return showError('The analysis response was malformed — please try again.');
    }

    renderResults(result, { edition, isMockData, context });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') showError('Analysis timed out (90s) — please try again.');
    else showError('Network error — check your connection.');
  } finally {
    setLoading(false);
  }
}

// ── RENDER ───────────────────────────────────────────────────────────────────
function renderResults(result, { edition, isMockData, context }) {
  const meta = context?.meta || {};
  resultsEl.innerHTML = renderAnalysisHtml(result, {
    edition,
    isMockData,
    sources: meta.sources || {},
    totalLists: meta.totalLists || 0,
  });
  resultsEl.style.display = 'block';
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setLoading(on) {
  spinnerEl.style.display = on ? 'block' : 'none';
  analyzeBtn.disabled = on;
  if (on) resultsEl.style.display = 'none';
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
  setLoading(false);
}

function hideError() {
  errorBox.style.display = 'none';
}

// ── EVENT WIRING (no inline handlers) ────────────────────────────────────────
document.getElementById('gearBtn').addEventListener('click', openSettings);
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('saveKeyBtn').addEventListener('click', saveKey);
document.getElementById('clearKeyBtn').addEventListener('click', clearKey);
analyzeBtn.addEventListener('click', analyze);

// Close modal on overlay click
settingsModal.addEventListener('click', function(e) {
  if (e.target === this) closeSettings();
});
