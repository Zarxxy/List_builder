'use strict';

// Presentation helpers shared by the browser front ends. Node does not use
// these, but they are colocated here so the two HTML pages stop duplicating
// them. build-pages.js inlines this into the static docs page; the server
// serves it to public/index.html via the /shared static route.

// Map an integer score (1–10) to a CSS band name.
function scoreBand(n) {
  if (n <= 3) return 'casual';
  if (n <= 5) return 'below-meta';
  if (n <= 7) return 'competitive';
  if (n <= 9) return 'strong';
  return 'meta-optimal';
}

// Human-readable edition name. Single source of truth — used by the prompt
// builder (shared/prompt.js), the crawler's SERP queries, and both front ends.
function editionLabel(edition) {
  return edition === '11ed' ? '11th Edition' : '10th Edition';
}

// "serp: 12, other: 3" summary of a crawl's per-source counts; '' when empty.
function formatSources(sources) {
  return Object.entries(sources || {}).map(([k, v]) => `${k}: ${v}`).join(', ');
}

// One-line provenance of the meta context. Shared by the prompt builder and
// the renderer so what the model is told and what the user sees never drift.
function dataSourceLine(isMockData, sources) {
  return isMockData
    ? 'Synthetic meta snapshot (approximate)'
    : `Real tournament data — sources: ${formatSources(sources) || 'none'}`;
}

// Escape a string for safe interpolation into innerHTML. Model output is
// attacker-influenceable (it echoes the user-pasted army list), so every
// interpolation must pass through this to prevent XSS.
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// HTML for the pre-flight list summary panel (both front ends render it under
// the list textarea; the summary object comes from shared/list-summary.js).
// Everything user-derived goes through esc().
function renderListSummaryHtml(summary) {
  if (!summary) return '';
  const chips = [];
  if (summary.detachment) chips.push(`<span class="chip chip-ok">Detachment: ${esc(summary.detachment)}</span>`);
  chips.push(`<span class="chip">${summary.unitCount} unit${summary.unitCount === 1 ? '' : 's'} parsed</span>`);
  if (summary.totalPoints > 0) {
    const declared = summary.declaredPoints ? ` / ${summary.declaredPoints}pts declared` : '';
    chips.push(`<span class="chip">${summary.totalPoints}pts${declared}</span>`);
  }
  const warnings = (summary.warnings || [])
    .map((w) => `<div class="summary-warning">⚠ ${esc(w)}</div>`)
    .join('');
  return `<div class="summary-chips">${chips.join('')}</div>${warnings}`;
}

// HTML for the full analysis results panel, shared by both front ends (they
// differ only in transport: /api/analyze vs. direct api.anthropic.com calls).
// `result` is the parsed model JSON — attacker-influenceable, so every
// interpolation of it goes through esc(). `opts` carries page-level context:
//   edition      '11ed' | '10ed'
//   isMockData   true when the analysis ran against the synthetic snapshot
//   sources      per-source list counts ({ serp: 12 })
//   totalLists   number of tournament lists behind the meta context
//   footerNote   optional page-specific footer suffix (plain text, e.g. the
//                model name); the mock/live provenance is added automatically
function renderAnalysisHtml(result, opts) {
  const { edition, isMockData, sources, totalLists, footerNote } = opts || {};
  const band = scoreBand(Number(result.score) || 0);

  const strengths  = (result.strengths || []).map((s) => `<li>${esc(s)}</li>`).join('');
  const weaknesses = (result.weaknesses || []).map((w) => `<li>${esc(w)}</li>`).join('');
  const comparisons = (result.comparison_points || []).map((p) => `<li>${esc(p)}</li>`).join('');
  const recs = (result.recommendations || []).map((rec, i) =>
    `<div class="rec-card"><div class="rec-num">${i + 1}</div><div class="rec-text">${esc(rec)}</div></div>`
  ).join('');

  const mockNotice = isMockData
    ? '<div class="mock-notice">⚠ Using synthetic meta snapshot — crawl this faction for live tournament data.</div>'
    : '';
  const dataLine = dataSourceLine(isMockData, sources);
  const provenance = isMockData ? 'meta snapshot' : 'live data';

  return `
    <div class="score-badge score-${band}">
      <div class="score-num">${esc(result.score ?? '?')}</div>
      <div class="score-label">${esc(result.score_label || band)}</div>
    </div>

    <div class="verdict-banner">${esc(result.verdict || '')}</div>

    <details open>
      <summary>Meta Context</summary>
      <div class="inner">
        ${mockNotice}
        <p class="data-line">${esc(dataLine)}</p>
        ${esc(result.meta_explanation || '')}
      </div>
    </details>

    <details open>
      <summary>Detachment Analysis</summary>
      <div class="inner">${esc(result.detachment_analysis || '')}</div>
    </details>

    <div class="sw-grid">
      <div class="sw-col strengths">
        <h4>Strengths</h4>
        <ul>${strengths}</ul>
      </div>
      <div class="sw-col weaknesses">
        <h4>Weaknesses</h4>
        <ul>${weaknesses}</ul>
      </div>
    </div>

    <details>
      <summary>Comparison to Meta</summary>
      <div class="inner"><ol class="comparison-list">${comparisons}</ol></div>
    </details>

    <details open>
      <summary>Recommendations</summary>
      <div class="inner" id="recommendations">${recs}</div>
    </details>

    <div class="results-footer">
      Analyzed against ${Number(totalLists) || 0} lists (${editionLabel(edition)}) · ${provenance}${footerNote ? ' · ' + esc(footerNote) : ''}
    </div>
  `;
}

// Export for Node; skipped when loaded as a plain browser script.
if (typeof module !== 'undefined' && module.exports) { module.exports = { scoreBand, esc, editionLabel, formatSources, dataSourceLine, renderListSummaryHtml, renderAnalysisHtml }; }
