'use strict';

// Network resilience helpers for the crawler: retry with backoff, a bounded
// concurrency pool, and per-domain politeness throttling.

// Local copy rather than an import from ./html — html.js depends on this
// module for fetchHtml retries, so importing back would be circular.
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

// fetch with exponential backoff + jitter. Retries thrown errors (network
// failures, timeouts) and 429/5xx responses; other statuses are returned
// as-is for the caller to handle. After exhausting retries, returns the last
// response or rethrows the last error. `fetchOpts` may be a function so each
// attempt gets fresh options (an AbortSignal.timeout must not be reused
// across attempts — its clock starts at creation).
async function fetchWithRetry(url, fetchOpts, {
  fetchImpl = fetch, retries = 2, baseDelayMs = 500, sleepFn = sleep,
} = {}) {
  for (let attempt = 0; ; attempt++) {
    if (attempt > 0) {
      await sleepFn(baseDelayMs * 2 ** (attempt - 1) + Math.random() * 250);
    }
    try {
      const opts = typeof fetchOpts === 'function' ? fetchOpts() : fetchOpts;
      const res = await fetchImpl(url, opts);
      if (!isRetryableStatus(res.status) || attempt === retries) return res;
    } catch (err) {
      if (attempt === retries) throw err;
    }
  }
}

// Order-preserving map with at most `limit` workers in flight. A worker
// exception becomes a null result for that item (one bad page never kills the
// run). `shouldStop()` cuts off scheduling of NEW items; items already in
// flight still complete.
async function mapWithConcurrency(items, limit, worker, { shouldStop = () => false } = {}) {
  const results = new Array(items.length).fill(null);
  let next = 0;
  async function run() {
    while (next < items.length && !shouldStop()) {
      const i = next++;
      try {
        results[i] = await worker(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, run);
  await Promise.all(workers);
  return results;
}

// Per-domain politeness: returns async (hostname) => void that resolves when
// it is the caller's turn for that domain, keeping at least minDelayMs
// between same-domain requests. Different domains never wait on each other.
function makeDomainThrottle(minDelayMs, { sleepFn = sleep, nowFn = Date.now } = {}) {
  const domains = new Map(); // hostname -> tail of that domain's wait chain
  return function throttle(hostname) {
    // -Infinity = "never requested": the first hit on a domain never waits.
    const prev = domains.get(hostname) || Promise.resolve(-Infinity);
    const turn = prev.then(async (lastAt) => {
      const wait = lastAt + minDelayMs - nowFn();
      if (wait > 0) await sleepFn(wait);
      return nowFn();
    });
    domains.set(hostname, turn);
    return turn.then(() => undefined);
  };
}

module.exports = { fetchWithRetry, mapWithConcurrency, makeDomainThrottle };
