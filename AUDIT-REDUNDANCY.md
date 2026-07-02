# Code Redundancy & Optimization Audit — WH40K List Analyzer

**Scope:** full repository sweep — source, shared modules, crawler, both front ends, test suites,
config, and CI. **Deliverable:** report only; no application code was changed.

**Baseline at audit time:** 82/82 unit tests pass (0 skipped, 0 commented-out), `npm run lint` clean,
~2,500 LOC excluding the lockfile. The prior audit (`AUDIT.md`) has been substantially applied: the
docs page is now generated from a template + `shared/` modules, the XSS class is closed and
regression-tested, per-site scrapers were removed, and `config.json` keys are wired through. This
audit covers what remains.

Findings are ordered by leverage within each category.

---

## 1. Code Duplication & Redundancies

### D1. Front-end UI layer duplicated between `public/index.html` and `docs/index.template.html`
- **Issue Type:** Duplication
- **Location:** `public/index.html:8-81` ↔ `docs/index.template.html:8-95` (CSS);
  `public/index.html:163-181,227-295` ↔ `docs/index.template.html:383-439`
  (`showError`/`hideError`/`setLoading`/`refreshSummary`/`renderResults`);
  `public/index.html:297-338` ↔ `docs/index.template.html:311-380` (`analyze()` scaffolding).
- **Description:** The largest remaining duplication in the repo — the same class of fork that
  produced the prior audit's XSS. Verified: **73 of ~88 CSS lines are byte-identical** (only the
  server badge vs. settings-modal styles differ). The JS helpers are near-identical
  (`setLoading`, `showError`, `hideError`, `refreshSummary`), and both `renderResults`
  implementations independently produce the same markup patterns (score badge, `sw-grid` lists,
  `rec-card` rows, sources line, footer) with the same `esc()` discipline. The `analyze()` functions
  share the `AbortController` + 90s timeout + status-mapped error scaffolding. Only the transport
  genuinely differs (`/api/analyze` vs. direct `api.anthropic.com`).
- **Proposed Solution:** Extend the existing shared-module mechanism, which already handles exactly
  this problem for JS logic:
  1. Extract the common CSS to `shared/styles.css`. The server already serves `/shared` statically
     (`server.js:32`), so `public/index.html` links it; `build-pages.js` inlines it into the
     template the same way it inlines the JS modules (a `<!--SHARED_STYLES-->` placeholder).
     Page-specific rules (badge/modal) stay in each page.
  2. Move result rendering into `shared/format.js` next to `renderListSummaryHtml`, e.g.
     `renderAnalysisHtml(result, { totalLists, sources, isMockData, modelLabel })` returning the
     full escaped fragment. Both pages keep a 3-line wrapper that assigns `innerHTML` and toggles
     visibility. The XSS e2e test (`tests/e2e/docs-smoke.mjs`) already guards the generated output.
  3. Optionally fold `showError`/`hideError`/`setLoading` into a tiny shared UI helper — but only
     if step 2 is done; alone they are too small to justify the indirection.
- **Impact:** **Medium effort / High value.** This is the remaining structural drift risk between
  the two front ends; every visual or rendering fix currently requires two synchronized edits.

### D2. `editionLabel` logic re-implemented in 4 places
- **Issue Type:** Duplication
- **Location:** `shared/prompt.js:14-16` (canonical) ↔ `crawler/sources/serp.js:44` ↔
  `public/index.html:229` ↔ `docs/index.template.html:395`.
- **Description:** The `'11ed' → '11th Edition'` mapping exists as a shared function plus three
  inline ternaries. Notably, the docs template *already has* `editionLabel` in scope (prompt.js is
  inlined into the page by `build-pages.js`) and still re-derives it inline; `serp.js` runs in Node
  and could simply `require` it.
- **Proposed Solution:** Move `editionLabel` from `shared/prompt.js` to `shared/format.js` (which
  `public/index.html` already loads via `/shared/format.js`; prompt.js keeps importing it in Node —
  note the bundle inliner strips `require` lines, so keep the inline order format-before-prompt).
  Then use it at all four sites:
  ```js
  // crawler/sources/serp.js
  const { editionLabel } = require('../../shared/format');
  const generic = `"${faction}" tournament army list warhammer 40k "${editionLabel(edition)}"`;
  ```
- **Impact:** **Low effort / Low-Medium value.** Cheap, removes a 4-way sync point.

### D3. Faction-name → slug conversion duplicated **and drifted**
- **Issue Type:** Duplication (with behavioral drift)
- **Location:** `crawler/index.js:62` ↔ `crawler/sources/serp.js:124`.
- **Description:** Two independent slug implementations:
  ```js
  // crawler/index.js — strips non-alphanumerics
  faction.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  // serp.js — does not
  faction.replace(/\s+/g, '-').toLowerCase()
  ```
  For `T'au Empire` these produce `tau-empire` (matches the canonical key in
  `shared/factions.js:16`) vs. `t'au-empire` (an apostrophe ends up in the SERP cache filename,
  `serp-cache-t'au-empire-11ed.json`). Not currently a bug, but it is exactly the kind of silent
  divergence that becomes one.
- **Proposed Solution:** Add the canonical converter to `shared/factions.js` (it defines the keys,
  so it should own the mapping) and use it at both sites:
  ```js
  function factionToKey(label) {
    return label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
  ```
- **Impact:** **Low effort / Medium value.** Note: existing `serp-cache-*` files for apostrophe
  factions would be orphaned (cache re-fetch, one-time SerpAPI cost).

### D4. Sources-summary string built identically in 3 places
- **Issue Type:** Duplication
- **Location:** `shared/prompt.js:51` ↔ `public/index.html:242` ↔ `docs/index.template.html:398`.
- **Description:** `Object.entries(sources).map(([k, v]) => `${k}: ${v}`).join(', ')` (twice with a
  `|| 'none'` fallback, once without) is repeated verbatim.
- **Proposed Solution:** `formatSources(sources)` in `shared/format.js`; both pages and prompt.js
  consume it (prompt.js via Node require; pages via the served/inlined module).
- **Impact:** **Low effort / Low value.** Fold into D1/D2 work.

### D5. `config.json` read + fallback constants duplicated
- **Issue Type:** Duplication
- **Location:** `list-analyzer.js:10-12` ↔ `build-pages.js:12-14`.
- **Description:** Both files independently `JSON.parse(fs.readFileSync('config.json'))` and apply
  identical fallback literals (`'claude-sonnet-4-6'`, `2000`). A model-id change that edits only the
  fallbacks needs two synchronized edits, and the fallbacks can drift from each other.
- **Proposed Solution:** A tiny `config.js` at the repo root:
  ```js
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
  const DEFAULT_MODEL = config.aiAnalysis?.defaultModel || 'claude-sonnet-4-6';
  const MAX_TOKENS = config.aiAnalysis?.maxTokens || 2000;
  module.exports = { config, DEFAULT_MODEL, MAX_TOKENS };
  ```
  `list-analyzer.js`, `build-pages.js`, `crawler/index.js`, `crawler/lib/html.js`, and
  `crawler/sources/serp.js` all read `config.json` separately today and could share this.
- **Impact:** **Low effort / Low-Medium value.**

### D6. Output-file path pattern constructed in 3 Node call sites
- **Issue Type:** Duplication
- **Location:** `server.js:15` ↔ `list-analyzer.js:66` ↔ `crawler/index.js:63`
  (plus regex forms in `build-pages.js:61` and `docs/index.template.html:231,324`, which must stay
  string-based for the browser).
- **Description:** `` `army-lists-${factionKey}-${edition}-latest.json` `` under `output/` is built
  three times. A rename of the artifact naming scheme touches five files.
- **Proposed Solution:** `outputFileFor(factionKey, edition)` in `utils.js` (or the D5 config
  module) for the three Node sites; leave the browser regexes with a comment pointing at the helper.
- **Impact:** **Low effort / Low value.**

### D7. Two identical parse loops inside `parseUnitsFromText`
- **Issue Type:** Duplication / Refactoring
- **Location:** `shared/list-summary.js:21-46`.
- **Description:** The `UNIT_REGEX` and `ALT_UNIT_REGEX` while-loops are identical except for the
  name-cleanup expression (strip `x2` prefix / trailing dots). Both repeat the dedup-key push logic.
- **Proposed Solution:**
  ```js
  function collect(regex, cleanName) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) {
      const rawName = cleanName(m[1]);
      const pts = parseInt(m[2], 10);
      if (rawName && pts > 0 && rawName.length < cap) {
        const key = rawName + '|' + pts;
        if (!seen.has(key)) { seen.add(key); units.push({ name: rawName, points: pts }); }
      }
    }
  }
  collect(UNIT_REGEX,     (s) => s.trim().replace(/^[x×]\d+\s+/i, '').replace(/\s*[-–:]\s*$/, ''));
  collect(ALT_UNIT_REGEX, (s) => s.trim().replace(/\.+$/, '').trim());
  ```
  Browser-safe (no Node constructs), so it inlines unchanged.
- **Impact:** **Low effort / Low value.** Behavior-preserving; covered by existing parser tests.

### D8. SERP defaults specified in three places
- **Issue Type:** Duplication (advisory)
- **Location:** `crawler/sources/serp.js:25-34` (`SERP_DEFAULTS`) ↔ `config.json:7-16`
  (`crawler.serp`) ↔ `tests/test-crawler-serp.js:13-23` (`serpCfg`).
- **Description:** The config block is byte-identical to the in-code defaults, so it currently
  changes nothing — but a reader can't tell which one is authoritative. The test copy is deliberate
  isolation (it pins the config the tests assume) and is acceptable; the code/config pair is the
  redundant one.
- **Proposed Solution:** Keep `SERP_DEFAULTS` as the single source of defaults and trim
  `config.json.crawler.serp` to *overrides only* (possibly `{}`), with a comment listing available
  keys. Alternatively delete `SERP_DEFAULTS` and make config mandatory — but the in-code default is
  safer for missing keys.
- **Impact:** **Low effort / Low value.**

---

## 2. Test Suite Redundancies & Gaps

The suite is healthy overall: 82 passing, no skipped tests, no commented-out tests, no
always-true assertions found. The redundancies below all stem from one root cause:
`list-analyzer.js` re-exports `shared/prompt.js` functions (see DC8), and both the shared module
and the re-export got their own test files.

### T1. `extractJSON` tested twice through the re-export
- **Issue Type:** Test Redundancy
- **Location:** `tests/test-list-analyzer.js:31-49` (4 tests) ↔ `tests/test-shared.js:57-62`.
- **Description:** Both files exercise the *same function object* (`list-analyzer.js:139` re-exports
  `shared/prompt.js`'s `extractJSON`) on the same four logical paths: bare JSON, fenced JSON,
  embedded JSON, garbage → null.
- **Proposed Solution:** Delete the four `extractJSON` tests from `test-list-analyzer.js`; the
  consolidated test in `test-shared.js` covers the module of record. (Pairs with DC8 — dropping the
  re-export makes the duplication impossible.)
- **Impact:** **Low risk.** No coverage loss; identical code paths.

### T2. `SUPPORTED_FACTIONS` invariants tested twice
- **Issue Type:** Test Redundancy
- **Location:** `tests/test-list-analyzer.js:160-179` (4 tests) ↔ `tests/test-shared.js:12-17`.
- **Description:** "has 26 entries" and "every entry has key + label" are asserted verbatim in both
  files against the same array. The `harlequins`-absent / `astra-militarum`-present checks are
  historical-regression guards unique to `test-list-analyzer.js` but belong with the module's tests.
- **Proposed Solution:** Keep one block in `test-shared.js` (the module of record), move the two
  membership guards there, delete all four from `test-list-analyzer.js`.
- **Impact:** **Low risk.**

### T3. `buildUserMessage` happy-path tested twice
- **Issue Type:** Test Redundancy
- **Location:** `tests/test-list-analyzer.js:116-141` ↔ `tests/test-shared.js:42-55`.
- **Description:** Near-identical fixtures and assertions (`'11th Edition'`,
  `'REQUIRED OUTPUT SCHEMA'`, `'DETACHMENT BREAKDOWN'`). Unique value per file: the shared test also
  checks the uppercased faction label; the analyzer test also checks the source line and the
  synthetic-data marker (`131-141`).
- **Proposed Solution:** Merge into one test block in `test-shared.js` carrying all assertions
  (label, edition, schema, breakdown, source line, `Synthetic` marker); remove from
  `test-list-analyzer.js`.
- **Impact:** **Low risk.**

### T4. Edition-label coverage duplicated between `buildSystemBlocks` and `buildSystemText`
- **Issue Type:** Test Redundancy
- **Location:** `tests/test-list-analyzer.js:26-29` ↔ `tests/test-shared.js:37-40`.
- **Description:** `buildSystemBlocks` is a one-line wrapper adding `cache_control` around
  `buildSystemText`. The first test (`18-24`, block shape + ephemeral cache_control) is the wrapper's
  real contract and worth keeping. The second (`10th edition label`) re-tests the wrapped function's
  behavior, already covered in `test-shared.js`.
- **Proposed Solution:** Delete the `buildSystemBlocks returns 10th edition label` test.
- **Impact:** **Low risk.**

### T5. Army-list fixtures duplicated byte-for-byte across test files
- **Issue Type:** Test Redundancy (fixtures)
- **Location:** `tests/test-utils.js:13-40` ↔ `tests/test-list-summary.js:9-36`
  (`GW_APP_LIST`, `BRACKET_PTS_LIST`).
- **Description:** The two canonical parser fixtures are copy-pasted. A future parser-format change
  (e.g. a new GW-app export quirk) must be mirrored in both files or the suites test different
  inputs while appearing to test the same thing.
- **Proposed Solution:** `tests/fixtures.js` exporting both constants; both test files require it.
  Keep the explanatory GW-app comment with the fixture, not the tests.
- **Impact:** **Low risk / quick win.**

### T6. Legacy source names in fixtures (stale-mock signal)
- **Issue Type:** Test Redundancy (stale fixture naming)
- **Location:** `tests/test-crawler-merger.js:15-16,121-126`; `tests/test-list-analyzer.js:72,101,118-126`;
  `tests/test-shared.js:44-47`.
- **Description:** Fixtures still use `source: 'listhammer'` / `listhammer.info` — a scraper deleted
  when the crawler moved to SerpAPI-only. The tests remain *valid* (merger and prompt code are
  source-agnostic, and `buildOutput counts sources correctly` genuinely needs two distinct source
  names), but the naming implies a data source that no longer exists and misleads new readers.
- **Proposed Solution:** Rename to `'serp'` / neutral placeholders (`'source-a'`, `'source-b'`) next
  time these files are touched. Not worth a dedicated PR.
- **Impact:** **Low risk / cosmetic.**

### T7. Near-duplicate edition-default tests in the merger suite
- **Issue Type:** Test Redundancy (borderline)
- **Location:** `tests/test-crawler-merger.js:41-51`.
- **Description:** Two tests cover `e.edition || defaultEdition` with falsy inputs `null` and `''` —
  the same branch. Arguably documents both falsy shapes; merging into one two-assertion test is a
  matter of taste.
- **Proposed Solution:** Optional merge. Listed for completeness.
- **Impact:** **Trivial.**

### G1. Gap: the 4-way faction-list sync has no guard test
- **Issue Type:** Test Gap
- **Location:** `shared/factions.js:4-6` (the comment demanding sync) ↔ `config.json:22-49`
  (`factionPatterns`) ↔ `.github/workflows/crawl-deploy.yml:10-36` (workflow choices).
- **Description:** The faction list is enumerated in three maintained places (four counting the
  workflow), and the only sync mechanism is a source comment. A faction added to `factions.js` but
  not `factionPatterns` silently gets a permissive fallback matcher in
  `crawler/sources/serp.js:100-105`; one missing from the workflow simply can't be crawled from CI.
  This is the one *new* cheap test with real payoff:
  ```js
  test('config.factionPatterns stays in sync with SUPPORTED_FACTIONS', () => {
    const labels = SUPPORTED_FACTIONS.map((f) => f.label).sort();
    assert.deepEqual(Object.keys(config.factionPatterns).sort(), labels);
  });
  test('crawl-deploy.yml workflow choices stay in sync with SUPPORTED_FACTIONS', () => {
    const yml = fs.readFileSync('.github/workflows/crawl-deploy.yml', 'utf-8');
    for (const f of SUPPORTED_FACTIONS) assert.ok(yml.includes(f.label), `${f.label} missing from workflow`);
  });
  ```
- **Impact:** **Low effort / Medium value.** Converts a comment-enforced invariant into a CI-enforced one.

---

## 3. Dead Code & Unused Dependencies

All items verified with a repo-wide reference search (excluding the generated `docs/index.html` and
`AUDIT.md`). ESLint's `no-unused-vars` cannot catch these because they are exported.

### DC1. `parseRecord` — unused function
- **Issue Type:** Dead Code
- **Location:** `utils.js:8-17` (+ export at `:51`).
- **Description:** Parses `"4-2-0"` win/loss/draw records. Zero call sites anywhere. Orphan of the
  removed listhammer scraper (the only source that produced `record` fields; the serp source always
  sets `record: null`, `crawler/sources/serp.js:210`).
- **Proposed Solution:** Delete function + export.
- **Impact:** **Low risk.**

### DC2. `flattenLists` — unused function referencing a legacy schema
- **Issue Type:** Dead Code
- **Location:** `utils.js:19-31` (+ export at `:51`).
- **Description:** Zero call sites. Also reads `entry.playerName || entry.player` — a `player` field
  no longer produced anywhere — confirming it predates the current pipeline.
- **Proposed Solution:** Delete function + export.
- **Impact:** **Low risk.**

### DC3. Unused export surface on internal helpers
- **Issue Type:** Dead Code (exports)
- **Location:** `utils.js:51` (`UNIT_REGEX`, `ALT_UNIT_REGEX` re-exports);
  `shared/list-summary.js:113` (`POINTS_UNIT`, `UNIT_REGEX`, `ALT_UNIT_REGEX`);
  `crawler/lib/html.js:82-87` (`EDITION_CUTOFF`, `MIN_UNITS`, `MIN_POINTS`, `extractTextFromHtml`);
  `utils.js:45` (`log.debug`, never called).
- **Description:** These are exported but never imported by any other module or test; the browser
  gets them via source inlining regardless of the export list. Exporting internals invites coupling
  and hides true dead code from lint.
- **Proposed Solution:** Trim the export lists to actual consumers:
  `utils.js` → `{ getArg, extractDetachment, flattenLists*, log, parseUnitsFromText }` (*minus DC1/DC2);
  `list-summary.js` → `{ parseUnitsFromText, extractDetachment, extractDeclaredPoints, summarizeList }`;
  `html.js` → `{ detectEdition, sleep, extractPreCodeBlocks, isValidListBlock, fetchHtml, extractPageDate, extractPageTitle }`.
- **Impact:** **Low risk.** Run the test suite after; nothing imports the removed names today.

### DC4. `mock-tournament-data.js` back-compat shim has one consumer left
- **Issue Type:** Dead Code (obsolete shim)
- **Location:** `mock-tournament-data.js:1-6`; consumer `list-analyzer.js:6`.
- **Description:** The shim exists "for back-compat with existing require()s and tests", but the
  tests already import `shared/mock-data` directly (`tests/test-shared.js:7`); `list-analyzer.js` is
  the sole remaining consumer.
- **Proposed Solution:** `list-analyzer.js`: `require('./shared/mock-data')`; delete the shim and
  update the stale pointer comment in `shared/factions.js:4` (which still names
  `mock-tournament-data.js` as a consumer).
- **Impact:** **Low risk.**

### DC5. `list-analyzer.js` re-exports that only tests consume
- **Issue Type:** Dead Code (exports) — root cause of T1/T3
- **Location:** `list-analyzer.js:138-139` (`buildUserMessage`, `extractJSON`).
- **Description:** Pure pass-throughs of `shared/prompt.js`. No runtime consumer (`server.js` uses
  only `analyzeList`, `SUPPORTED_FACTIONS`, `DEFAULT_MODEL`); only `tests/test-list-analyzer.js`
  imports them, which is what produced the duplicate test coverage.
- **Proposed Solution:** Drop both re-exports; tests import from `shared/prompt` (or simply delete
  the duplicate tests per T1/T3).
- **Impact:** **Low risk.**

### DC6. Stale ESLint globals for deleted scrapers
- **Issue Type:** Dead Code (config)
- **Location:** `eslint.config.mjs:8-9`.
- **Description:** `document`/`window`/`navigator` are injected into the *Node* globals block with a
  comment citing `crawler/sources/listhammer.js + tabletop-to.js page.evaluate() callbacks` — files
  deleted in the SerpAPI migration. Keeping browser globals in the Node config means a typo like
  `window.foo` in server code lints clean.
- **Proposed Solution:** Remove the three globals + comment from `nodeGlobals`; add
  `document`/`window` to the e2e block's globals (`eslint.config.mjs:32`), which spreads
  `nodeGlobals` and does use them inside `page.evaluate()`/`waitForFunction` callbacks.
- **Impact:** **Low risk.** Verify with `npm run lint`.

### Dependencies — no findings
All six declared packages are in use: `express`/`dotenv` (`server.js`), `@anthropic-ai/sdk`
(lazy-required in `list-analyzer.js:91`), `eslint`+`@eslint/js` (lint), `playwright` (e2e only,
correctly a devDependency using the preinstalled browser). No orphaned test files: every
`tests/*.js` is in the `npm test` list and every helper in them is referenced.

---

## 4. Structural & Architectural Refactoring Opportunities

### S1. Redundant two-layer error handling in the crawler orchestrator
- **Issue Type:** Refactoring (dead branch)
- **Location:** `crawler/index.js:42-53`.
- **Description:** Every task is built with `.catch()` returning `{ source, entries: [], ok: false }`
  — so the promises **cannot reject** — yet they are then awaited with `Promise.allSettled`, and the
  loop carries a `rejected` fallback (`{ source: '?', entries: [], ok: false }`) that is
  unreachable. Two error-handling mechanisms where one does the work.
- **Proposed Solution:**
  ```js
  const results = await Promise.all(tasks);   // tasks already .catch() into a value
  for (const val of results) {
    log.info(`Source "${val.source}": ${val.entries.length} entries${val.ok ? '' : ' (FAILED)'}`);
    allEntries = allEntries.concat(val.entries);
  }
  ```
- **Impact:** **Low risk.** Behavior-identical; deletes an unreachable branch.

### S2. Extract the docs template's inline script so the browser code is lintable
- **Issue Type:** Refactoring (SRP + closes the last prior-audit gap)
- **Location:** `docs/index.template.html:206-452` (~250-line inline script);
  `public/index.html:146-346` (~200-line inline script); `eslint.config.mjs:41` (ignores both dirs).
- **Description:** The prior audit's §7.3 ("front-end JS is entirely unlinted") is still open: the
  page-specific UI code — the security-sensitive layer that renders model output — lives in inline
  `<script>` blocks ESLint never sees. It's also where the only lint-level nit found by hand lives
  (`public/index.html:233`: unused `i` parameter in the comparisons `.map((c, i) =>`)`). The single
  file also mixes state, transport, rendering, and modal management.
- **Proposed Solution:** Move each page's script to a file: `public/app.js` (served statically,
  loaded via `<script src>`) and `docs/app.template.js` (inlined by `build-pages.js` via a
  placeholder, exactly like the shared modules). Add both to a browser-globals ESLint block. No
  deployment change; `verify:pages` keeps guarding the generated output.
- **Impact:** **Medium effort / Medium value.** Pairs naturally with D1 — do them together.

### S3. Minor simplifications (batch into any nearby PR)
- **Issue Type:** Refactoring (trivial)
- **Location & Description:**
  - `server.js:45-56` — `rateLimitMap.set(ip, entry)` is called on both the limited and allowed
    paths; hoist to a single `set` before the count check.
  - `public/index.html:233` — unused index parameter `i` (caught by lint once S2 lands).
  - `crawler/merger.js:59-71` — the primary-key pass scans **all** existing keys per entry, O(n²)
    with a `split('\x00')` per comparison. At the current cap (≤50 lists/source per crawl) this is
    irrelevant; noted only so a future "crawl everything" change knows to index by `player\x00event`
    first and fuzzy-match dates within that bucket. **No change recommended now** — that would be
    optimizing an un-hit path.
- **Impact:** **Trivial risk.**

### Non-findings (checked, deliberately left alone)
- **`buildContextFromOutput` / `summarizeList` sizes** — both are cohesive single-purpose functions;
  splitting them would be abstraction for its own sake.
- **No file violates SRP badly enough to split** on the Node side; the largest file
  (`crawler/sources/serp.js`, 226 lines) is one pipeline with clear phase comments and an injectable
  `fetchImpl`, and is well-tested.
- **The `mockResponse`/`makeFetchImpl` test doubles** in `test-crawler-serp.js` are single-file
  helpers with no second consumer — leave them local.
- **`SERP_DEFAULTS` vs config duality** — see D8; the mechanism (`{ ...defaults, ...config }`) is
  itself fine.

---

## Priority Summary

| # | Finding | Type | Effort | Value |
|---|---------|------|--------|-------|
| D1+S2 | Consolidate front-end CSS + render/UI code via the existing shared/inline mechanism; make browser JS lintable | Duplication / Refactoring | Medium | **High** |
| DC1–DC6 | Delete dead functions, shim, stale exports & ESLint globals | Dead Code | Low | Medium |
| T1–T5 | Deduplicate test coverage; centralize fixtures | Test Redundancy | Low | Medium |
| G1 | Add faction-list sync guard tests | Test Gap | Low | Medium |
| D2–D4 | Centralize `editionLabel`, faction slug, sources formatting | Duplication | Low | Medium |
| S1 | Remove unreachable crawler error branch | Refactoring | Low | Low |
| D5–D8, T6–T7, S3 | Config loader, path helper, parse-loop extraction, fixture renames, micro-simplifications | Various | Low | Low |

*Report only — no source files were modified. Line numbers reference the repository state at commit
time of this audit; re-verify before applying fixes.*
