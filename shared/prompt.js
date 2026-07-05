'use strict';

// Single source of truth for the Claude prompt construction + JSON extraction.
// Consumed by Node (list-analyzer.js) and inlined into the static docs page by
// build-pages.js. Previously duplicated (and drifted) between list-analyzer.js
// and docs/index.html.
const { SUPPORTED_FACTIONS } = require('./factions');
const { editionLabel, dataSourceLine } = require('./format');

function factionLabel(factionKey) {
  const found = SUPPORTED_FACTIONS.find((f) => f.key === factionKey);
  return found ? found.label : factionKey;
}

// Returns the system prompt as a plain string. Node wraps it with cache_control
// in list-analyzer.js's buildSystemBlocks(); the browser sends it as-is.
function buildSystemText(faction, edition) {
  const edLabel = editionLabel(edition);
  return [
    `You are an expert Warhammer 40,000 ${edLabel} competitive analyst.`,
    `Evaluate a player's army list against the current tournament meta for their faction.`,
    `Use your knowledge of ${edLabel} rules, points costs, detachments, and faction abilities.`,
    '',
    '=== ANALYSIS RULES — FOLLOW STRICTLY ===',
    'RULE 1 — SCORE: Integer 1–10.',
    '  1–3 Casual | 4–5 Below Meta | 6–7 Competitive | 8–9 Strong | 10 Meta-Optimal',
    'RULE 2 — SCORE LABEL: "Casual" | "Below Meta" | "Competitive" | "Strong" | "Meta-Optimal"',
    'RULE 3 — DETACHMENT ANALYSIS: ≤60 words on how well the list exploits its detachment.',
    'RULE 4 — META EXPLANATION: ≤80 words on current meta context.',
    '  Only reference units/detachments present in the provided tournament data.',
    '  If data is marked as synthetic, note that clearly.',
    'RULE 5 — STRENGTHS: Exactly 3 strings (not objects), each ≤20 words.',
    'RULE 6 — WEAKNESSES: Exactly 3 strings (not objects), each ≤20 words.',
    'RULE 7 — COMPARISON POINTS: Exactly 3 strings (not objects), each ≤25 words.',
    '  Name specific units and their tournament frequency where provided.',
    'RULE 8 — RECOMMENDATIONS: Exactly 3 strings (not objects), each ≤30 words.',
    `  Actionable — reference tournament data and ${edLabel} rules.`,
    'RULE 9 — VERDICT: Single sentence ≤25 words.',
    'IMPORTANT: Respond with ONLY valid JSON. Start with { end with }.',
  ].join('\n');
}

function buildUserMessage(listText, factionKey, edition, context) {
  const label = factionLabel(factionKey);
  const edLabel = editionLabel(edition);
  const { meta = {}, detachmentBreakdown = [], topUnitsByDetachment = {}, isMockData, sources = {} } = context || {};

  const dataSource = dataSourceLine(isMockData, sources);

  const lines = [
    `=== TOURNAMENT META DATA: ${label.toUpperCase()} (${edLabel}) ===`,
    `Source: ${dataSource}`,
    `Total lists: ${meta.totalLists || 0} | Last crawled: ${meta.crawledAt || 'N/A'}`,
    '',
  ];

  if (detachmentBreakdown.length > 0) {
    lines.push('DETACHMENT BREAKDOWN:');
    for (const d of detachmentBreakdown) {
      lines.push(`  ${d.detachment} — ${d.count} lists (${d.percentage}%)`);
    }
    lines.push('');
  }

  const tubd = topUnitsByDetachment || {};
  if (Object.keys(tubd).length > 0) {
    lines.push('TOP UNITS BY DETACHMENT:');
    for (const [det, units] of Object.entries(tubd)) {
      if (!units || units.length === 0) continue;
      const unitStr = units.slice(0, 5).map((u) => `${u.name} (${u.frequency}%)`).join(', ');
      lines.push(`  ${det}: ${unitStr}`);
    }
    lines.push('');
  }

  lines.push('=== SUBMITTED ARMY LIST ===');
  lines.push(listText.slice(0, 5000));
  lines.push('');
  lines.push('=== REQUIRED OUTPUT SCHEMA ===');
  lines.push('{ score, score_label, detachment_analysis, meta_explanation,');
  lines.push('  strengths[], weaknesses[], comparison_points[], recommendations[], verdict }');

  return lines.join('\n');
}

function extractJSON(raw) {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch {}
  }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace  = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  return null;
}

// Export for Node; the whole line is stripped when inlined into the browser.
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildSystemText, buildUserMessage, extractJSON, factionLabel }; }
