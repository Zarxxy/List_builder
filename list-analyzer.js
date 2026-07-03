'use strict';

const fs = require('fs');
const { outputFileFor } = require('./utils');
const { getMockData } = require('./shared/mock-data');
const { SUPPORTED_FACTIONS } = require('./shared/factions');
const { buildSystemText, buildUserMessage, extractJSON } = require('./shared/prompt');
const { buildContextFromOutput } = require('./shared/tournament-context');
const { DEFAULT_MODEL, MAX_TOKENS } = require('./config');

function normalizeListText(raw) {
  return raw
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"');
}

function loadTournamentContext(faction, edition) {
  const ed = edition || '11ed';
  const file = outputFileFor(faction, ed);
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

// Wrap the shared system text with an ephemeral cache_control block for the SDK.
function buildSystemBlocks(faction, edition) {
  return [{ type: 'text', text: buildSystemText(faction, edition), cache_control: { type: 'ephemeral' } }];
}

async function analyzeList({ listText, faction, edition, apiKey, model }) {
  const ed = edition || '11ed';
  const mod = model || DEFAULT_MODEL;
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
      max_tokens: MAX_TOKENS,
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
  buildSystemBlocks,
  normalizeListText,
  SUPPORTED_FACTIONS,
  DEFAULT_MODEL,
};
