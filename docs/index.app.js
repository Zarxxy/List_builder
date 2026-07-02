'use strict';

// UI for the static GitHub Pages build — calls api.anthropic.com directly with
// a user-supplied session key. This file is inlined into docs/index.html by
// build-pages.js AFTER the shared modules bundle, so the shared helpers below
// are in scope as plain script globals. The model-id and max-tokens
// placeholders (double-underscore tokens in analyze()) are substituted from
// config.json at build time.
/* global SUPPORTED_FACTIONS, getMockData, summarizeList, renderListSummaryHtml,
          renderAnalysisHtml, buildSystemText, buildUserMessage, extractJSON,
          __MAX_TOKENS__ */

// ── STATE ────────────────────────────────────────────────────────────────────
let factionsWithRealData = new Set();

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

  document.getElementById('factionSelect').addEventListener('change', checkReady);
  document.getElementById('listText').addEventListener('input', () => { checkReady(); refreshSummary(); });
  document.querySelectorAll('input[name="edition"]').forEach((r) => {
    r.addEventListener('change', () => { buildFactionSelect(); checkReady(); });
  });
})();

function buildFactionSelect() {
  const edition = document.querySelector('input[name="edition"]:checked').value;
  const sel = document.getElementById('factionSelect');
  const current = sel.value;
  sel.innerHTML = '';
  for (const f of SUPPORTED_FACTIONS) {
    const hasLive = factionsWithRealData.has(`${f.key}:${edition}`);
    const ctx = getMockData(f.key, edition);
    const listCount = hasLive ? '(live data)' : (ctx ? `(${ctx.meta.totalLists} lists — meta snapshot)` : '(no data)');
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = `${f.label} ${listCount}`;
    sel.appendChild(opt);
  }
  if (current) sel.value = current;
}

function checkReady() {
  const hasKey = !!sessionStorage.getItem('anthropic_key');
  const hasFaction = !!document.getElementById('factionSelect').value;
  const hasText = document.getElementById('listText').value.trim().length >= 10;
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = !(hasKey && hasFaction && hasText);
  if (!hasKey) btn.textContent = 'Enter API key in settings ⚙';
  else btn.textContent = 'Analyze List';
}

// Live pre-flight summary: what the parser sees, before any API tokens are spent.
function refreshSummary() {
  const el = document.getElementById('listSummary');
  const summary = summarizeList(document.getElementById('listText').value);
  el.innerHTML = renderListSummaryHtml(summary);
  el.style.display = summary ? 'block' : 'none';
}

function updateApiKeyStatus() {
  const el = document.getElementById('apiKeyStatus');
  const hasKey = !!sessionStorage.getItem('anthropic_key');
  el.textContent = hasKey ? '✓ API key saved for this session' : 'No API key — click ⚙ to add one';
  el.style.color = hasKey ? '#56d364' : '#f0a32e';
  checkReady();
}

// ── SETTINGS MODAL ───────────────────────────────────────────────────────────
function openSettings() {
  const k = sessionStorage.getItem('anthropic_key') || '';
  document.getElementById('apiKeyInput').value = k ? '••••••••••' + k.slice(-4) : '';
  document.getElementById('settingsModal').classList.add('open');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
function saveKey() {
  const v = document.getElementById('apiKeyInput').value.trim();
  if (v && !v.startsWith('••')) {
    sessionStorage.setItem('anthropic_key', v);
    updateApiKeyStatus();
  }
  closeSettings();
}
function clearKey() {
  sessionStorage.removeItem('anthropic_key');
  document.getElementById('apiKeyInput').value = '';
  updateApiKeyStatus();
  closeSettings();
}

// ── ANALYZE ──────────────────────────────────────────────────────────────────
async function analyze() {
  const apiKey = sessionStorage.getItem('anthropic_key');
  if (!apiKey) { showError('Enter your Anthropic API key in settings ⚙'); return; }

  const factionKey = document.getElementById('factionSelect').value;
  const edition    = document.querySelector('input[name="edition"]:checked').value;
  const listText   = document.getElementById('listText').value.trim();
  if (!listText || listText.length < 10) { showError('Please paste your army list before analyzing.'); return; }

  // Load tournament context
  const dataKey = `${factionKey}:${edition}`;
  let context = null;
  if (factionsWithRealData.has(dataKey)) {
    context = await fetch(`./data/army-lists-${factionKey}-${edition}-latest.json`)
      .then((r) => r.json()).catch(() => null);
  }
  if (!context) context = getMockData(factionKey, edition);

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
        model: '__MODEL_ID__',
        max_tokens: __MAX_TOKENS__,
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

    renderResults(result, {
      edition,
      isMockData: !factionsWithRealData.has(dataKey),
      context,
    });
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
  // context is either a crawled output file ({ totalLists, sources, ... }) or
  // a mock snapshot ({ meta: { totalLists, sources }, ... }) — accept both.
  const totalLists = context?.totalLists ?? context?.meta?.totalLists ?? 0;
  const sources = context?.sources || context?.meta?.sources || {};

  const el = document.getElementById('results');
  el.innerHTML = renderAnalysisHtml(result, {
    edition,
    isMockData,
    sources,
    totalLists,
    footerNote: isMockData ? 'meta snapshot' : 'live data',
  });
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setLoading(on) {
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('analyzeBtn').disabled = on;
  if (on) document.getElementById('results').style.display = 'none';
}

function showError(msg) {
  const el = document.getElementById('errorBox');
  el.textContent = msg;
  el.style.display = 'block';
  setLoading(false);
}

function hideError() {
  document.getElementById('errorBox').style.display = 'none';
}

// ── EVENT WIRING (no inline handlers) ────────────────────────────────────────
document.getElementById('gearBtn').addEventListener('click', openSettings);
document.getElementById('closeSettingsBtn').addEventListener('click', closeSettings);
document.getElementById('saveKeyBtn').addEventListener('click', saveKey);
document.getElementById('clearKeyBtn').addEventListener('click', clearKey);
document.getElementById('analyzeBtn').addEventListener('click', analyze);

// Close modal on overlay click
document.getElementById('settingsModal').addEventListener('click', function(e) {
  if (e.target === this) closeSettings();
});
