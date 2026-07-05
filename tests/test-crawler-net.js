'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { fetchWithRetry, mapWithConcurrency, makeDomainThrottle } = require('../crawler/lib/net');

function res(status) {
  return { ok: status < 400, status };
}

// --- fetchWithRetry ---

test('fetchWithRetry retries thrown errors and 5xx, then succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls === 1) throw new Error('network down');
    if (calls === 2) return res(500);
    return res(200);
  };
  const out = await fetchWithRetry('https://x.test/', {}, { fetchImpl, retries: 2, sleepFn: async () => {} });
  assert.equal(out.status, 200);
  assert.equal(calls, 3);
});

test('fetchWithRetry does not retry non-retryable statuses like 404', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return res(404); };
  const out = await fetchWithRetry('https://x.test/', {}, { fetchImpl, retries: 2, sleepFn: async () => {} });
  assert.equal(out.status, 404);
  assert.equal(calls, 1);
});

test('fetchWithRetry retries 429 and returns the last response when exhausted', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return res(429); };
  const out = await fetchWithRetry('https://x.test/', {}, { fetchImpl, retries: 2, sleepFn: async () => {} });
  assert.equal(out.status, 429);
  assert.equal(calls, 3);
});

test('fetchWithRetry rethrows after exhausting retries and backs off exponentially', async () => {
  const delays = [];
  const fetchImpl = async () => { throw new Error('boom'); };
  await assert.rejects(
    fetchWithRetry('https://x.test/', {}, { fetchImpl, retries: 2, baseDelayMs: 100, sleepFn: async (ms) => delays.push(ms) }),
    /boom/
  );
  assert.equal(delays.length, 2);
  assert.ok(delays[0] >= 100 && delays[0] < 350, `first delay ${delays[0]}`);   // 100 + jitter
  assert.ok(delays[1] >= 200 && delays[1] < 450, `second delay ${delays[1]}`);  // 200 + jitter
});

test('fetchWithRetry evaluates function-style fetchOpts fresh per attempt', async () => {
  let optsCalls = 0;
  let calls = 0;
  const fetchImpl = async () => { calls++; return calls < 3 ? res(500) : res(200); };
  await fetchWithRetry('https://x.test/', () => { optsCalls++; return {}; }, { fetchImpl, retries: 2, sleepFn: async () => {} });
  assert.equal(optsCalls, 3);
});

// --- mapWithConcurrency ---

test('mapWithConcurrency never exceeds the concurrency limit and preserves order', async () => {
  let inFlight = 0;
  let peak = 0;
  const items = Array.from({ length: 10 }, (_, i) => i);
  const out = await mapWithConcurrency(items, 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return n * 2;
  });
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
  assert.deepEqual(out, items.map((n) => n * 2));
});

test('mapWithConcurrency turns worker errors into nulls', async () => {
  const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('bad item');
    return n;
  });
  assert.deepEqual(out, [1, null, 3]);
});

test('mapWithConcurrency stops scheduling new items when shouldStop returns true', async () => {
  let done = 0;
  const out = await mapWithConcurrency([1, 2, 3, 4, 5], 1, async (n) => {
    done++;
    return n;
  }, { shouldStop: () => done >= 2 });
  assert.equal(done, 2);
  assert.deepEqual(out, [1, 2, null, null, null]);
});

// --- makeDomainThrottle ---

test('makeDomainThrottle spaces same-domain requests but not cross-domain ones', async () => {
  let clock = 0;
  const sleeps = [];
  const throttle = makeDomainThrottle(500, {
    sleepFn: async (ms) => { sleeps.push(ms); clock += ms; },
    nowFn: () => clock,
  });
  await throttle('a.test');            // first hit: no wait
  await throttle('b.test');            // different domain: no wait
  await throttle('a.test');            // same domain, 0ms elapsed: waits 500
  assert.deepEqual(sleeps, [500]);
  clock += 600;
  await throttle('a.test');            // enough time has passed: no wait
  assert.deepEqual(sleeps, [500]);
});
