'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../server');

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /shared/format.js serves the shared browser helpers', async () => {
  const res = await fetch(`${base}/shared/format.js`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes('function esc('), 'esc() missing from /shared/format.js');
  assert.ok(body.includes('function scoreBand('), 'scoreBand() missing from /shared/format.js');
  assert.ok(body.includes('function renderAnalysisHtml('), 'renderAnalysisHtml() missing from /shared/format.js');
});

test('GET /shared/styles.css serves the shared stylesheet', async () => {
  const res = await fetch(`${base}/shared/styles.css`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('.score-badge'), 'shared styles missing .score-badge');
});

test('GET / serves the public page wired to the shared assets and app script', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.ok(body.includes('id="factionSelect"'), 'faction select missing');
  assert.ok(body.includes('/shared/styles.css'), 'shared stylesheet link missing');
  assert.ok(body.includes('/shared/format.js'), 'shared script tag missing');
  assert.ok(body.includes('/app.js'), 'app script tag missing');
});

test('GET /app.js serves the page UI script', async () => {
  const res = await fetch(`${base}/app.js`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('renderAnalysisHtml('), 'app.js does not use the shared renderer');
});

test('GET /api/factions returns all 26 factions with list counts', async () => {
  const res = await fetch(`${base}/api/factions`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.factions));
  assert.equal(data.factions.length, 26);
  for (const f of data.factions) {
    assert.ok(f.key && f.label, `bad faction ${JSON.stringify(f)}`);
    assert.ok(f.listCounts && '11ed' in f.listCounts, 'missing listCounts');
  }
});

test('unknown /api/* route returns JSON 404', async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  const data = await res.json();
  assert.ok(data.error);
});
