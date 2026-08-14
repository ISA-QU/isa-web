# Recruitment Intelligence Dashboard

The dashboard at `/` (and `/dashboard`) is a port of the Streamlit app that lived in
`dashboard/`. It renders the same ten tabs from the same data, but as part of this
Next.js app rather than a separate Python service.

## Routes

| Route | Page |
|---|---|
| `/` | Recruitment Intelligence dashboard |
| `/dashboard` | The same dashboard, so the explicit URL resolves |
| `/transcript` | Transcript list — this used to be `/` |
| `/calculator` | GPA calculator (unchanged) |

The dashboard header links to `/transcript` ("View transcripts") and `/calculator`
("Create transcript").

## Why the data lives in S3

This app is a **static export** (`output: "export"`) served from GitHub Pages. There
is no server at runtime, so nothing can query a database on request. The dashboard
instead fetches pre-built JSON from S3 and does all filtering and aggregation in the
browser.

The source CSVs and the generated JSON are both gitignored. Git holds no data.

## Building the data

The build script reads the Streamlit project's CSVs and rolls them down to their
analytic grain, writing dictionary-encoded columnar JSON:

```bash
# Reads dashboard/data/, writes dashboard-data/ and copies into public/ for local dev
npm run dashboard:data

# Point at CSVs somewhere else
node scripts/build-dashboard-data.mjs --src /path/to/data --out /path/to/output
```

Output is roughly **133 KB gzipped** for the full 64,000-row dataset:

| File | Contents |
|---|---|
| `operational.json` | Monthly by post, Jan 2023 – Sep 2025 |
| `annual-country.json` | Annual by country/nationality, FY1997 – FY2024 |
| `posts-monthly.json` | Monthly by post, Mar 2017 – Sep 2025 |
| `country-metrics.json` | Precomputed per-country reference metrics |
| `reference.json` | Country map coordinates |
| `manifest.json` | Coverage and row counts |

Because the whole grain ships to the browser, every filter combination the Streamlit
app offered still works — nothing is precomputed per-filter.

The script also writes a `.gz` alongside each `.json`.

## Uploading to S3

Create a bucket (or reuse a prefix on an existing one). This is public U.S. State
Department statistics, so public read is fine; use CloudFront if you'd rather not
expose the bucket directly.

```bash
BUCKET=qu-dashboard-data

aws s3 sync dashboard-data/ "s3://$BUCKET/dashboard-data/" \
  --exclude "*.gz" \
  --content-type application/json \
  --cache-control "public, max-age=3600"
```

To serve the pre-gzipped files instead (smaller transfer, same URLs):

```bash
for f in dashboard-data/*.json.gz; do
  name=$(basename "$f" .gz)
  aws s3 cp "$f" "s3://$BUCKET/dashboard-data/$name" \
    --content-type application/json \
    --content-encoding gzip \
    --cache-control "public, max-age=3600"
done
```

### Bucket policy (public read)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::qu-dashboard-data/dashboard-data/*"
    }
  ]
}
```

### CORS

The browser fetches these cross-origin, so the bucket needs:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://isa-qu.github.io"
    ],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]
```

### Pointing the app at it

Set the origin at build time — static export bakes it into the bundle:

```bash
NEXT_PUBLIC_DASHBOARD_DATA_URL=https://qu-dashboard-data.s3.amazonaws.com/dashboard-data \
  npm run deploy
```

Without the variable the app falls back to `public/dashboard-data/`, which
`npm run dashboard:data` populates for local development.

## Verifying the port

The Python metric functions were reimplemented in TypeScript. `npm run dashboard:verify`
checks them against values the original Python produced:

```bash
npm run dashboard:verify
```

It asserts 61 checks, including all six derived metrics across the 190 countries that
harmonization left untouched, plus the row counts and issuance totals from the
Streamlit project's own validation code.

Two caveats the script encodes, both real differences in the original project:

- `country_historical_metrics.csv` was built by `build_historical_metrics.py` from the
  **un-harmonized** annual file, so it still contains pre-merge duplicates
  (`China - Taiwan` and `Taiwan`, two Congo variants, `Macedonia` and `North Macedonia`).
  `app.py` recomputes its runtime metrics from the harmonized file instead and keeps the
  CSV separate. Only the harmonization-untouched countries are comparable.
- That pipeline also uses a different "Low volume" rule (`latest_f1 < 100 and peak_f1 < 250`)
  than `app.py`'s runtime `historical_trend_direction` (`latest_f1 < 100`). The port follows
  `app.py`, since that is what the dashboard displays.

## Architecture

```
app/
  page.tsx, dashboard/page.tsx     -> DashboardShell
  components/dashboard/
    DashboardShell.tsx             tab bar, header, nav buttons
    DashboardContext.tsx           shared filter state + derived rollups
    Sidebar.tsx, HeaderKpis.tsx
    Chart.tsx                      lazy Plotly wrapper
    ui.tsx, shared.tsx             QU-styled primitives
    tabs/                          one file per tab
  lib/dashboard/
    metrics.ts                     the ported Python metric functions
    data.ts                        fetch + decode
    types.ts, constants.ts, format.ts, sort.ts
scripts/
  build-dashboard-data.mjs         CSV -> JSON
  verify-dashboard-data.mjs        port verification
  dashboard/reference-maps.json    POST_COUNTRY + COUNTRY_COORDS, extracted from utils/data.py
```

Plotly (~5 MB uncompressed) is dynamically imported, so it lands in its own chunk and
no page loads it until a chart mounts. `/transcript` and `/calculator` never pay for it.

## Known issues carried over from the Streamlit app

These are defects in the original that the port reproduces rather than silently fixes.
Each is a small change if you want it corrected.

1. **Two tab labels are swapped.** The tab labelled "Consulates" shows Country
   Intelligence; the tab labelled "Research: Country" shows Consulate Intelligence.
   (`app.py` `tabs[3]` / `tabs[4]`.)
2. **`GROWTH_LABEL` is wrong.** It reads `2023–2025 Jan–Sep Growth`, but `yoy_growth()`
   compares only the two most recent years — currently 2024 vs 2025.
3. **Only 38 countries have map coordinates.** `COUNTRY_COORDS` in `utils/data.py` covers
   38 of the 165 countries in the operational data, so the Executive tab's signal map and
   the Analytics bubble chart silently omit 127 countries. The Executive globe is a
   choropleth keyed on country name and is unaffected. The port adds a caption stating how
   many countries are shown; the underlying gap is unchanged.
4. **A dead control.** Country 360's "Comparable Period Mode" radio is rendered but never
   read by any calculation.

## AI Insights

The AI tab's live generation **does not work today and did not work in the Streamlit app
either**: there is no `ANTHROPIC_API_KEY` in the environment, no `secrets.toml` (only the
`.example`), and `app.py` never reads `st.secrets` or sets the variable — so
`anthropic.Anthropic()` raises on every click and the tab falls to its error path.

The port reproduces that: the deterministic KPIs and snapshot cards work, and the button
reports that no briefing service is configured.

To enable it, add a Lambda that holds the key and proxies the request — the browser cannot
hold the key on a static site. Follow the pattern in `backend/README.md`, and use a current
model rather than the hardcoded `claude-sonnet-4-20250514`.
