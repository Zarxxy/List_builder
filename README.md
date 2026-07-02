# WH40K List Analyzer

AI-powered competitive analyzer for Warhammer 40,000 army lists. Paste your list, select your faction and edition, and get a scored analysis against real tournament meta data pulled from multiple sources.

**Live app:** [GitHub Pages deployment](https://zarxxy.github.io/List_builder/) — bring your own Anthropic API key.

## Features

- **Multi-source tournament data:** listhammer.info (Playwright), Goonhammer (HTTP), SerpAPI (optional)
- **11th and 10th Edition support** — 11th Edition is the default
- **26 factions** with mock meta snapshots for all; live data for crawled factions
- **AI analysis via Claude:** competitive score (1–10), strengths/weaknesses, meta comparison, recommendations
- **Live pre-flight list summary:** as you paste, see the detected detachment, parsed unit count, and points total (vs. the declared total), with warnings when the list doesn't parse — before spending an API call
- **GitHub Pages deployment:** static, no server required — Claude is called directly from the browser
- **Local dev mode:** Express server keeps the API key server-side

## Prerequisites

- Node.js ≥ 20.0.0
- Anthropic API key (for analysis)
- SerpAPI key (optional — enables SerpAPI source)

## Setup

```bash
git clone https://github.com/Zarxxy/List_builder.git
cd List_builder
cp .env.example .env
# Edit .env and fill in your keys
npm install   # also installs Playwright Chromium via postinstall
```

## Crawling Tournament Data

Run a crawl to pull fresh lists from enabled sources:

```bash
# Death Guard — 11th Edition (default)
npm run crawl:dg

# Space Marines — 11th Edition
npm run crawl:sm

# Aeldari — 11th Edition
npm run crawl:aeldari

# Any faction by name
node crawler/index.js --faction "Orks" --edition 11ed

# Specific sources only
node crawler/index.js --faction "Death Guard" --sources listhammer,goonhammer
```

Output is written to `output/army-lists-{faction}-{edition}-latest.json`.

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

The GitHub Actions workflow (`crawl-deploy.yml`) is **manual-only** — it does not run on a schedule. Trigger it from the **Actions → "Crawl & Deploy to GitHub Pages" → Run workflow** button, choosing a faction and edition; it crawls the selected faction and deploys to Pages. This keeps SerpAPI usage under your control (one crawl ≈ one SerpAPI search, cached 7 days).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (local dev) | Claude API key — server-side only |
| `SERPAPI_KEY` | No | Enables SerpAPI source; skip gracefully if absent |
| `PORT` | No | HTTP port (default: 3000) |
| `CLAUDE_MODEL` | No | Override model (default: `claude-sonnet-4-6`) |
| `TRUST_PROXY` | No | Set to `1` when behind Nginx/Cloudflare |

On GitHub Pages, the API key is entered by the user in the settings panel (⚙) and stored in `sessionStorage` (cleared when the tab closes).

## Data Sources

| Source | Enabled by default | Notes |
|---|---|---|
| **listhammer.info** | Yes | Playwright-based; full list text + event data |
| **Goonhammer** | Yes | HTTP fetch; extracts lists from `<pre>`/`<code>` blocks |
| **SerpAPI** | Yes (if key set) | Google Search API; caches results 7 days |
| **BCP** | No | Best Coast Pairings — enable in `config.json`; may violate ToS |
| **Tabletop.to** | No | Tabletop.to — enable in `config.json`; may violate ToS |

To enable BCP or Tabletop.to (personal/research use only), add them to `enabledSources` in `config.json`.

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
