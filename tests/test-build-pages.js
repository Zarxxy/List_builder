'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildSharedBundle, renderIndexHtml, MODEL_ID } = require('../build-pages');

test('buildSharedBundle inlines shared modules without Node-only lines', () => {
  const bundle = buildSharedBundle();
  assert.ok(bundle.includes('SUPPORTED_FACTIONS'));
  assert.ok(bundle.includes('function esc('));
  assert.ok(bundle.includes('function buildUserMessage('));
  // No require()/module.exports/guard may leak into the browser bundle.
  assert.ok(!/=\s*require\(/.test(bundle), 'require() leaked into bundle');
  assert.ok(!/module\.exports/.test(bundle), 'module.exports leaked into bundle');
  assert.ok(!/typeof module/.test(bundle), 'export guard leaked into bundle');
});

test('renderIndexHtml resolves every placeholder', () => {
  const html = renderIndexHtml();
  assert.ok(!html.includes('<!--SHARED_MODULES-->'));
  assert.ok(!html.includes('__MODEL_ID__'));
  assert.ok(!html.includes('__MAX_TOKENS__'));
  assert.ok(html.includes(MODEL_ID), 'model id from config not injected');
});

test('generated page carries the full 8-key mock data (drift regression)', () => {
  const html = renderIndexHtml();
  assert.ok(html.includes('chaos-space-marines-10ed'));
});

test('generated render code escapes all model-output interpolations', () => {
  const html = renderIndexHtml();
  // Every model field must go through esc(); the raw (unescaped) forms that the
  // pre-fix docs used must not reappear.
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
