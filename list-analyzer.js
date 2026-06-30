'use strict';

const fs = require('fs');
const path = require('path');
const { parseUnitsFromText } = require('./utils');
const { getMockData } = require('./mock-tournament-data');

const SUPPORTED_FACTIONS = [
  { key: 'death-guard',         label: 'Death Guard' },
  { key: 'space-marines',       label: 'Space Marines' },
  { key: 'astra-militarum',     label: 'Astra Militarum' },
  { key: 'aeldari',             label: 'Aeldari' },
  { key: 'chaos-space-marines', label: 'Chaos Space Marines' },
  { key: 'orks',                label: 'Orks' },
  { key: 'tyranids',            label: 'Tyranids' },
  { key: 'necrons',             label: 'Necrons' },
  { key: 'tau-empire',          label: "T'au Empire" },
  { key: 'drukhari',            label: 'Drukhari' },
  { key: 'adeptus-mechanicus',  label: 'Adeptus Mechanicus' },
  { key: 'adeptus-custodes',    label: 'Adeptus Custodes' },
  { key: 'grey-knights',        label: 'Grey Knights' },
  { key: 'dark-angels',         label: 'Dark Angels' },
  { key: 'blood-angels',        label: 'Blood Angels' },
  { key: 'space-wolves',        label: 'Space Wolves' },
  { key: 'black-templars',      label: 'Black Templars' },
  { key: 'deathwatch',          label: 'Deathwatch' },
  { key: 'thousand-sons',       label: 'Thousand Sons' },
  { key: 'world-eaters',        label: 'World Eaters' },
  { key: 'chaos-daemons',       label: 'Chaos Daemons' },
  { key: 'imperial-knights',    label: 'Imperial Knights' },
  { key: 'chaos-knights',       label: 'Chaos Knights' },
  { key: 'leagues-of-votann',   label: 'Leagues of Votann' },
  { key: 'adepta-sororitas',    label: 'Adepta Sororitas' },
  { key: 'genestealer-cults',   label: 'Genestealer Cults' },
];

function normalizeListText(raw) {
  return raw
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
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

function buildContextFromOutput(raw) {
  const meta = {
    faction: raw.faction,
    totalLists: raw.totalLists || 0,
    crawledAt: raw.crawledAt,
    edition: raw.edition,
    sources: raw.sources || {},
  };

  const detachmentBreakdown = Object.keys(raw.sections || {})
    .filter((k) => k !== 'All' && k !== 'Unknown')
    .map((det) => ({
      detachment: det,
      count: raw.sections[det].length,
      percentage: ((raw.sections[det].length / (raw.totalLists || 1)) * 100).toFixed(1),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topUnitsByDetachment = {};
  for (const det of detachmentBreakdown) {
    const entries = raw.sections[det.detachment] || [];
    const tally = {};
    for (const entry of entries) {
      const units = parseUnitsFromText(entry.armyListText || '');
      for (const u of units) {
        tally[u.name] = (tally[u.name] || 0) + 1;
      }
    }
    topUnitsByDetachment[det.detachment] = Object.entries(tally)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({
        name,
        count,
        frequency: ((count / (entries.length || 1)) * 100).toFixed(1),
      }));
  }

  return { meta, detachmentBreakdown, topUnitsByDetachment, sources: raw.sources || {}, isMockData: false, edition: raw.edition };
}

function loadTournamentContext(faction, edition) {
  const ed = edition || '11ed';
  const file = path.join(__dirname, 'output', `army-lists-${faction}-${ed}-latest.json`);
  if (fs.existsSync(file)) {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return buildContextFromOutput(raw);
    } catch {}
  }
  const mock = getMockData(faction, ed);
  if (mock) return mock;
  return { meta: { totalLists: 0 }, detachmentBreakdown: [], topUnitsByDetachment: {}, sources: {}, isMockData: false, edition: ed };
}

function buildSystemBlocks(faction, edition) {
  const edLabel = edition === '11ed' ? '11th Edition' : '10th Edition';
  const text = [
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

  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

function buildUserMessage(listText, faction, edition, context) {
  const edLabel = edition === '11ed' ? '11th Edition' : '10th Edition';
  const { meta = {}, detachmentBreakdown = [], topUnitsByDetachment = {}, isMockData, sources = {} } = context || {};

  const sourceStr = Object.entries(sources).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
  const dataSource = isMockData
    ? 'Synthetic meta snapshot (approximate)'
    : `Real tournament data — sources: ${sourceStr}`;

  const lines = [
    `=== TOURNAMENT META DATA: ${faction.toUpperCase()} (${edLabel}) ===`,
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

  if (Object.keys(topUnitsByDetachment).length > 0) {
    lines.push('TOP UNITS BY DETACHMENT:');
    for (const [det, units] of Object.entries(topUnitsByDetachment)) {
      if (units.length === 0) continue;
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

async function analyzeList({ listText, faction, edition, apiKey, model }) {
  const ed = edition || '11ed';
  const mod = model || 'claude-sonnet-4-6';
  const normalized = normalizeListText(listText);
  const context = loadTournamentContext(faction, ed);

  let Anthropic;
  try {
    Anthropic = require('@anthropic-ai/sdk');
  } catch {
    throw new Error('@anthropic-ai/sdk not installed — run npm install');
  }

  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const system = buildSystemBlocks(faction, ed);
  const userMsg = buildUserMessage(normalized, faction, ed, context);

  async function call() {
    return client.messages.create({
      model: mod,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });
  }

  let message = await call();
  let raw = message.content.find((b) => b.type === 'text')?.text || '';
  let result = extractJSON(raw);

  if (!result) {
    message = await call();
    raw = message.content.find((b) => b.type === 'text')?.text || '';
    result = extractJSON(raw);
  }

  if (!result) throw new Error('Failed to parse Claude response as JSON after retry');

  return {
    ...result,
    faction,
    edition: ed,
    generatedAt: new Date().toISOString(),
    model: mod,
    isMockData: context.isMockData,
    sources: context.sources || {},
    totalLists: context.meta?.totalLists || 0,
  };
}

module.exports = {
  analyzeList,
  loadTournamentContext,
  buildContextFromOutput,
  buildSystemBlocks,
  buildUserMessage,
  extractJSON,
  normalizeListText,
  SUPPORTED_FACTIONS,
};
