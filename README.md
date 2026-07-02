# WH40K List Analyzer

AI-powered competitive analyzer for Warhammer 40,000 army lists. Paste your list, select your faction and edition, and get a scored analysis against real tournament meta data gathered via SerpAPI.

**Live app:** [GitHub Pages deployment](https://zarxxy.github.io/List_builder/) — bring your own Anthropic API key.

## Features

- **SerpAPI-driven tournament data:** Google Search discovers tournament-list articles (generic + site-targeted queries, e.g. Goonhammer/Woehammer); lists are then extracted from the discovered pages over plain HTTP — no browser automation, no per-site scrapers
- **11th and 10th Edition support** — 11th Edition is the default
- **26 factions** with mock meta snapshots for all; live data for crawled factions
- **AI analysis via Claude:** competitive score (1–10), strengths/weaknesses, meta comparison, recommendations
- **Live pre-flight list summary:** as you paste, see the detected detachment, parsed unit count, and points total (vs. the declared total), with warnings when the list doesn't parse — before spending an API call
- **GitHub Pages deployment:** static, no server required — Claude is called directly from the browser
- **Local dev mode:** Express server keeps the API key server-side

## Prerequisites

- Node.js ≥ 20.0.0
- Anthropic API key (for analysis)
- SerpAPI key (required for crawling; the app itself runs without it)

## Setup

```bash
git clone https://github.com/Zarxxy/List_builder.git
cd List_builder
cp .env.example .env
# Edit .env and fill in your keys
npm install
```

## Crawling Tournament Data

Crawling requires `SERPAPI_KEY` in `.env`. Run a crawl to pull fresh lists:

```bash
# Death Guard — 11th Edition (default)
npm run crawl:dg

# Space Marines — 11th Edition
npm run crawl:sm

# Aeldari — 11th Edition
npm run crawl:aeldari

# Any faction by name
node crawler/index.js --faction "Orks" --edition 11ed
```

Output is written to `output/army-lists-{faction}-{edition}-latest.json`.

**SerpAPI cost:** one crawl issues at most `crawler.serp.maxQueries` searches (default 4 — one generic query plus one per site target), and responses are cached for 7 days, so re-crawling the same faction within a week costs nothing. On SerpAPI's 100-search free tier that's ~25 crawls/month. Tune `maxQueries`, `siteTargets`, `maxUrlFetches`, and the rest of the `crawler.serp` block in `config.json`.

**After crawling**, restart the local server to refresh faction list counts.

## Running Locally

```bash
# Requires ANTHROPIC_API_KEY in .env
npm start
# → http://localhost:3000
```

For development with auto-reload:

```bash
npm run start:dev
```

## GitHub Pages Deployment

The `docs/` directory is the GitHub Pages root. To update tournament data:

```bash
npm run crawl:dg          # crawl data → output/
node build-pages.js       # copy output/ → docs/data/ + write manifest.json
git add docs/data/        # if you want to commit static data (optional)
```

The GitHub Actions workflow (`crawl-deploy.yml`) is **manual-only** — it does not run on a schedule. Trigger it from the **Actions → "Crawl & Deploy to GitHub Pages" → Run workflow** button, choosing a faction and edition; it crawls the selected faction and deploys to Pages. This keeps SerpAPI usage under your control (one crawl ≤ 4 SerpAPI searches by default, cached 7 days).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (local dev) | Claude API key — server-side only |
| `SERPAPI_KEY` | Yes (crawling only) | SerpAPI key — the crawler exits with an error if absent; server/analysis run without it |
| `PORT` | No | HTTP port (default: 3000) |
| `CLAUDE_MODEL` | No | Override model (default: `claude-sonnet-4-6`) |
| `TRUST_PROXY` | No | Set to `1` when behind Nginx/Cloudflare |

On GitHub Pages, the API key is entered by the user in the settings panel (⚙) and stored in `sessionStorage` (cleared when the tab closes).

### Supplying the SerpAPI key safely

- **Locally:** copy `.env.example` to `.env` and set `SERPAPI_KEY=...` there. `.env` is gitignored and is loaded by both `server.js` and the crawler. Don't export the key inline on the command line — it ends up in shell history.
- **GitHub Actions:** add it as a repository secret named `SERPAPI_KEY` (**Settings → Secrets and variables → Actions → New repository secret**). The crawl workflow already reads `${{ secrets.SERPAPI_KEY }}`; GitHub masks it in logs.
- Never commit the key or paste it into code, issues, or PRs. If it ever leaks, regenerate it in the SerpAPI dashboard.

## Data Sources

SerpAPI (Google Search) is the sole data source. Discovery and extraction are two phases:

1. **Discovery** — up to `maxQueries` SerpAPI searches per crawl: a generic tournament-list query plus one `site:` query per entry in `crawler.serp.siteTargets` (default: goonhammer.com, woehammer.com). Results are deduplicated across queries, filtered against `skipDomains`, and cached for `serpCacheTTLDays` (7 days).
2. **Extraction** — each discovered page is fetched over plain HTTP and army lists are pulled from `<pre>`/`<code>` blocks, validated for shape (≥5 units, ≥500 pts) and faction relevance before being kept.

The previous per-site scrapers (listhammer.info via Playwright, Goonhammer, BCP, Tabletop.to) were removed in favor of this pipeline; they remain available in git history.

## API (Local Dev Server)

### `GET /api/factions`

Returns all supported factions with crawled list counts.

```json
{
  "factions": [
    { "key": "death-guard", "label": "Death Guard", "listCounts": { "11ed": 42, "10ed": 0 } }
  ]
}
```

### `POST /api/analyze`

Analyzes an army list against the tournament meta.

**Request body:**
```json
{
  "listText": "Detachment: Plague Company\nPlague Marines [100pts]\n...",
  "faction": "death-guard",
  "edition": "11ed"
}
```

**Response:**
```json
{
  "score": 7,
  "score_label": "Competitive",
  "detachment_analysis": "...",
  "meta_explanation": "...",
  "strengths": ["...", "...", "..."],
  "weaknesses": ["...", "...", "..."],
  "comparison_points": ["...", "...", "..."],
  "recommendations": ["...", "...", "..."],
  "verdict": "...",
  "faction": "death-guard",
  "edition": "11ed",
  "isMockData": false,
  "totalLists": 42,
  "generatedAt": "2025-09-15T12:00:00.000Z"
}
```

Rate limit: 10 requests per minute per IP.

## Testing

```bash
npm test       # unit tests (no network, no API calls)
npm run lint   # ESLint
```
