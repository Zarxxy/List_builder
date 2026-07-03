'use strict';

// UI for the server-backed front end. Shared helpers are loaded as plain
// scripts before this file: renderAnalysisHtml + renderListSummaryHtml from
// /shared/format.js, summarizeList from /shared/list-summary.js.
/* global renderAnalysisHtml, renderListSummaryHtml, summarizeList */

let allFactions = [];
const factionSelect = document.getElementById('factionSelect');
const listText = document.getElementById('listText');
const analyzeBtn = document.getElementById('analyzeBtn');
const spinner = document.getElementById('spinner');
const resultsEl = document.getElementById('results');
const errorBox = document.getElementById('errorBox');
const summaryEl = document.getElementById('listSummary');

function getEdition() {
  return document.querySelector('input[name="edition"]:checked').value;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = 'block';
  spinner.style.display = 'none';
  analyzeBtn.disabled = false;
}

function hideError() {
  errorBox.style.display = 'none';
}

function setLoading(on) {
  spinner.style.display = on ? 'block' : 'none';
  analyzeBtn.disabled = on;
  if (on) {
    resultsEl.style.display = 'none';
    hideError();
  }
}

function rebuildFactionOptions() {
  const edition = getEdition();
  factionSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Select a faction —';
  factionSelect.appendChild(placeholder);

  for (const f of allFactions) {
    const count = f.listCounts?.[edition] || 0;
    const suffix = count > 0 ? ` (${count} lists — live)` : ' (meta snapshot)';
    const opt = document.createElement('option');
    opt.value = f.key;
    opt.textContent = f.label + suffix;
    factionSelect.appendChild(opt);
  }
  updateBtn();
}

function updateBtn() {
  const ready = factionSelect.value && listText.value.trim().length >= 10;
  analyzeBtn.disabled = !ready;
}

// Live pre-flight summary: what the parser sees, before any API tokens are spent.
function refreshSummary() {
  const summary = summarizeList(listText.value);
  summaryEl.innerHTML = renderListSummaryHtml(summary);
  summaryEl.style.display = summary ? 'block' : 'none';
}

async function loadFactions() {
  try {
    const res = await fetch('/api/factions');
    if (!res.ok) throw new Error('Failed to load factions');
    const data = await res.json();
    allFactions = data.factions || [];
    rebuildFactionOptions();
  } catch {
    factionSelect.innerHTML = '<option value="">Error loading factions — is the server running?</option>';
  }
}

function renderResults(result) {
  resultsEl.innerHTML = renderAnalysisHtml(result, {
    edition: result.edition,
    isMockData: result.isMockData,
    sources: result.sources,
    totalLists: result.totalLists,
    footerNote: `model: ${result.model || 'Claude'}`,
  });
  resultsEl.style.display = 'block';
}

async function analyze() {
  const faction = factionSelect.value;
  const edition = getEdition();
  const list = listText.value.trim();

  if (!faction) return showError('Please select a faction.');
  if (list.length < 10) return showError('Please paste your army list (minimum 10 characters).');

  setLoading(true);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listText: list, faction, edition }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) return showError('Server API key is invalid — check ANTHROPIC_API_KEY env var.');
      if (res.status === 429) return showError(err.error || 'Rate limited. Please wait a moment.');
      if (res.status === 503) return showError('ANTHROPIC_API_KEY is not configured on the server.');
      return showError(err.error || `Server error (${res.status})`);
    }

    const result = await res.json();
    renderResults(result);
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') return showError('Analysis timed out after 90 seconds — please try again.');
    showError('Network error — is the server running?');
  } finally {
    setLoading(false);
    updateBtn();
  }
}

document.querySelectorAll('input[name="edition"]').forEach(r => r.addEventListener('change', rebuildFactionOptions));
factionSelect.addEventListener('change', updateBtn);
listText.addEventListener('input', () => { updateBtn(); refreshSummary(); });
analyzeBtn.addEventListener('click', analyze);

loadFactions();
