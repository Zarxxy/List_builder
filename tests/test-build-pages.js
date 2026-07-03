'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildSharedBundle, renderIndexHtml, MODEL_ID } = require('../build-pages');

test('buildSharedBundle inlines shared modules without Node-only lines', () => {
  const bundle = buildSharedBundle();
  assert.ok(bundle.includes('SUPPORTED_FACTIONS'));
  assert.ok(bundle.includes('function esc('));
  assert.ok(bundle.includes('function buildUserMessage('));
  assert.ok(bundle.includes('function renderAnalysisHtml('));
  assert.ok(bundle.includes('function buildContextFromOutput('));
  // Build-config consts must precede the modules (index.app.js references them).
  assert.ok(/^\/\/ ── build config/.test(bundle), 'config prelude missing or not first');
  assert.ok(bundle.includes(`const MODEL_ID = "${MODEL_ID}";`));
  assert.ok(/const MAX_TOKENS = \d+;/.test(bundle));
  // No require()/module.exports/guard may leak into the browser bundle.
  assert.ok(!/=\s*require\(/.test(bundle), 'require() leaked into bundle');
  assert.ok(!/module\.exports/.test(bundle), 'module.exports leaked into bundle');
  assert.ok(!/typeof module/.test(bundle), 'export guard leaked into bundle');
});

test('renderIndexHtml resolves every placeholder', () => {
  const html = renderIndexHtml();
  assert.ok(!html.includes('/*SHARED_STYLES*/'));
  assert.ok(!html.includes('<!--SHARED_MODULES-->'));
  assert.ok(!html.includes('<!--PAGE_SCRIPT-->'));
  assert.ok(html.includes(MODEL_ID), 'model id from config not injected');
});

test('generated page carries the shared styles and the page UI script', () => {
  const html = renderIndexHtml();
  assert.ok(html.includes('.score-badge'), 'shared styles not inlined');
  assert.ok(html.includes('function buildFactionSelect('), 'docs/index.app.js not inlined');
});

test('generated page carries the full 8-key mock data (drift regression)', () => {
  const html = renderIndexHtml();
  assert.ok(html.includes('chaos-space-marines-10ed'));
});

test('generated render code escapes all model-output interpolations', () => {
  const html = renderIndexHtml();
  // Rendering goes through the shared renderAnalysisHtml, whose every model
  // field passes through esc(); the raw (unescaped) forms that the pre-fix
  // docs used must not reappear anywhere in the page.
  assert.ok(html.includes('function renderAnalysisHtml('));
  assert.ok(html.includes('${esc(s)}'));   // strengths
  assert.ok(html.includes('${esc(w)}'));   // weaknesses
  assert.ok(html.includes('${esc(p)}'));   // comparison points
  assert.ok(html.includes('${esc(rec)}')); // recommendations
  assert.ok(!html.includes('<li>${s}</li>'), 'unescaped strength interpolation present');
  assert.ok(!html.includes('${rec}</div>'), 'unescaped recommendation interpolation present');
});

test('generated inline script is syntactically valid JavaScript', () => {
  const html = renderIndexHtml();
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'no inline <script> found');
  // new Function compiles (parses) the body without executing it.
  assert.doesNotThrow(() => new Function(m[1]));
});
