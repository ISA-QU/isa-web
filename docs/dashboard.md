# Recruitment Intelligence Dashboard

The dashboard at `/` (and `/dashboard`) is a port of the Streamlit app that lived in
`dashboard/`. It renders seven of the original ten tabs, now fed from three Excel workbooks
through two Lambdas.

## Routes

| Route | Page |
|---|---|
| `/` | Recruitment Intelligence dashboard |
| `/dashboard` | The same dashboard, so the explicit URL resolves |
| `/transcript` | Transcript list |
| `/calculator` | GPA calculator |

## How the data flows

```
raw workbooks in S3 ──► rebuild-dashboard Lambda ──► snapshot/snapshot.json.gz ──► get-dashboard Lambda ──► GET /dashboard ──► browser
  raw/*.xlsx              (merge, validate)            (~90 KB)                     (serves it)
```

The site is a static export on GitHub Pages, so nothing runs per request except the
`get-dashboard` Lambda. The browser downloads one snapshot and does every filter and chart
itself. Neither the raw files nor the snapshot are in git.

### The raw files

`rebuild-dashboard` recognises each file by its columns, not its name, so any of these
can be uploaded again later in the same shape:

| Kind | Required columns | Supplies |
|---|---|---|
| post | `calendar_year`, `calendar_month`, `post`, `visa_class`, `issuances` | Monthly consulate history, and the operational layer (its last three calendar years) |
| nationality | `calendar_year`, `calendar_month`, `nationality`, `visa_class`, `issuances` | Annual history for fiscal years the official tables don't cover yet |
| historical | `fiscal_year`, `nationality`, `visa_class`, `issuances` (+ `data_source`) | Annual country history back to FY1997 |

Rules the build applies:

- **Newer files replace older ones month by month.** A file replaces every month (or, for a
  historical file, every fiscal year) it contains. Re-uploading a corrected file is safe.
- **Official annual figures win.** Each fiscal year uses the official annual workbook
  figures when the historical file has them, and otherwise sums the monthly nationality
  reports. That's what keeps the current fiscal year current as monthly files arrive.
- **Names are unified.** Nationality spellings are rewritten to the post data's names
  (`China - Mainland` → `China`, `Korea, South` → `South Korea`, …), so every tab sees
  one name per country. The table is `NATIONALITY_ALIASES` in the Lambda.
- **Posts need a country.** The post file has no country column; `POST_COUNTRY` in the
  Lambda supplies it. A post missing from that map is left out and reported as a warning
  in the rebuild output. Add it to the map and redeploy.
- **Old post labels are renamed.** `POST_ALIASES` in the Lambda maps older consulate
  labels to the current name (`Mumbai (Bombay)` → `Mumbai`, `Port Au Prince` →
  `Port-au-Prince`, …), so each post's history is one series. The original labels, with
  their row and issuance counts, are listed in the snapshot's
  `validation.postsMonthly.renamedPosts` and on the `renamed` line of the rebuild output.
  If an old and a current label both report the same month and visa class, the build
  stops rather than add them together, since that could count the same visas twice.
  **The deployed `rebuild-dashboard` Lambda has not been updated with `POST_ALIASES`
  yet**; only the code in this repo and the local build (`npm run dashboard:data`) have it.
- **Non-nationalities are excluded** from country views: "Unknown", "Non-Nationality Based
  Issuances", "British National Overseas", "Palestinian Authority Travel Document", "No
  Nationality".
- **A broken file changes nothing.** Duplicate rows, non-numeric counts or unrecognisable
  columns fail the build with the file name and row number, and the previous snapshot stays.

## AWS setup

Do these in the AWS console with the account the website uses. Everything is in
`us-east-1`, like the transcript backend.

### 1. S3 bucket

1. **S3 → Create bucket.** Pick a globally unique name, e.g. `isa-dashboard-qu`. Keep
   **Block all public access** on; only the Lambdas read it.
2. After creating it: **Properties → Bucket Versioning → Enable.** Every rebuild keeps the
   previous snapshot, so a bad upload can be rolled back.
3. **Create folder** `raw`, open it, and **Upload** the three workbooks:
   - `dashboard_by_post_F1_J1_2017_2026.xlsx`
   - `dashboard_by_nationality_F1_J1_2017_2026.xlsx`
   - `dashboard_historical_by_nationality_F1_J1_1997_2026_YTD_clean.xlsx`

If you chose a name other than `isa-dashboard`, change the `BUCKET` line at the top of
both Lambda files before pasting them.

### 2. `rebuild-dashboard` Lambda

1. **Lambda → Create function.** Name `rebuild-dashboard`, runtime **Python 3.12**, x86_64.
2. Paste `backend/lambdas/rebuild-dashboard/lambda_function.py` into the editor → **Deploy**.
3. **Configuration → General configuration → Edit:** memory **1024 MB**, timeout
   **1 min**. (It needs about 2 s and 100 MB today; the headroom is for growth.)
4. **Configuration → Permissions →** open the role → **Add permissions → Create inline
   policy → JSON:**

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::<BUCKET>" },
       { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::<BUCKET>/raw/*" },
       { "Effect": "Allow", "Action": "s3:PutObject", "Resource": "arn:aws:s3:::<BUCKET>/snapshot/*" }
     ]
   }
   ```

5. **Test** tab → create an event with body `{}` → **Test.** The result lists the rows and
   coverage it built and any warnings, e.g.
   `"postsMonthly": "41965 rows, 2017-03 to 2026-02"` and `"warnings": []`. The bucket now
   has `snapshot/snapshot.json.gz`.

### 3. `get-dashboard` Lambda

1. **Create function** `get-dashboard`, **Python 3.12**.
2. Paste `backend/lambdas/get-dashboard/lambda_function.py` → **Deploy**. The defaults
   (128 MB, 3 s) are enough.
3. Inline policy:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::<BUCKET>" },
       { "Effect": "Allow", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::<BUCKET>/snapshot/*" }
     ]
   }
   ```

   `ListBucket` is there so a missing snapshot comes back as a clear 404 rather than S3's
   "Access Denied".

### 4. API route

1. **API Gateway →** open the HTTP API the website already calls. It's the one in
   `app/lib/awsConfig.ts`: `https://8scq4w84j2.execute-api.us-east-1.amazonaws.com/prod`.
   (`backend/awsConfig.js` names a different API ID, `0xyagl1p7e`. The website uses the
   `8scq4w84j2` one.)
2. **Routes → Create:** `GET /dashboard` → **Attach integration** → Lambda →
   `get-dashboard`.
3. **CORS:** the existing settings already allow `GET` from `http://localhost:3000` and
   `https://isa-qu.github.io`, so nothing to add.
4. If the `prod` stage doesn't auto-deploy: **Deploy → prod**.
5. Check it: open `https://8scq4w84j2.execute-api.us-east-1.amazonaws.com/prod/dashboard` in
   a browser. You should get JSON starting with `{"schema":"dashboard-snapshot@1"`.

### 5. Website

Nothing to configure: the site calls `<API>/dashboard` by default. Run `npm run deploy`.

## Updating the data

Until the upload button exists:

1. Upload the new workbook(s) into the bucket's `raw/` folder. Keep the old ones there.
   Newer files override the months they contain, so the old ones still provide the
   history the new file doesn't cover.
2. Run the `rebuild-dashboard` **Test** again and check `warnings` in the result.
3. Reload the site.

To roll back, open `snapshot/snapshot.json.gz` → **Versions** and restore the previous
version, or delete the bad raw file and rebuild.

## Local development

```bash
npm run dashboard:data     # builds public/dashboard-data/snapshot.json from ./dashboard/*.xlsx
npm run dashboard:verify   # checks the snapshot and the ported metrics against validated figures
```

The local build runs the same `rebuild-dashboard` code, reading the raw files from
`dashboard/` instead of S3. To make `npm run dev` read the local snapshot instead of the
live API, create `.env.development.local` (gitignored, and never read by `npm run deploy`):

```
NEXT_PUBLIC_DASHBOARD_DATA_URL=/isa-web/dashboard-data/snapshot.json
```

The deploy build deletes `out/dashboard-data`, so a local snapshot is never published.

## Verifying the port

`npm run dashboard:verify` asserts:
- the snapshot has no missing months, unmapped posts or build warnings;
- the controls the Streamlit project validated: the Mar 2017 – Sep 2025 consulate totals
  (40,175 rows, 3,037,511 F1, 2,417,151 J1), the India and Zimbabwe Jan 2023 – Sep 2025 F1
  windows, and six FY2024 nationality figures. They're all historical, so they don't move
  as months are added;
- the pure classifiers transcribed from `app.py`;
- that every historical metric is measured from the latest *complete* fiscal year.

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
    data.ts                        fetch + decode the snapshot
    types.ts, constants.ts, format.ts, sort.ts
backend/lambdas/
  rebuild-dashboard/               raw workbooks -> snapshot (also runs locally)
  get-dashboard/                   serves the snapshot at GET /dashboard
scripts/
  verify-dashboard-data.mjs        snapshot + port verification
```

Plotly (~5 MB uncompressed) is dynamically imported, so it lands in its own chunk and no
page loads it until a chart mounts. `/transcript` and `/calculator` never pay for it.

## Choices the data forced

- **The header cards use a rolling 12 months.** The five cards above the tabs compare the
  latest 12 months of consulate data with the 12 months before (e.g. Mar 2025 – Feb 2026
  vs Mar 2024 – Feb 2025), from `rollingTwelveMonths()` in `lib/dashboard/rolling.ts`.
  They ignore the sidebar Years filter. The heading above them names the period, and
  each card's hover tooltip gives both date ranges, both totals and the exact change. "Country" there
  is where the visa was issued (the consulate's country), not the student's nationality,
  because the snapshot has no monthly nationality data. A change shows only when both
  windows have all 12 months.
- **Growth is shown as the latest 12 months vs the previous 12.** The original's
  `yoy_growth()` compares the months of the latest calendar year with the same months a year
  earlier, which with data through February is a noisy two-month comparison. Every growth
  figure on the tabs (Executive focus card and globe, Country Intelligence KPIs and rankings,
  Consulate Intelligence risers and fallers, Command Center movers, Country 360's comparison
  line) now uses `rollingTotals()` from `lib/dashboard/rolling.ts`, labelled "vs previous
  12 months", the same windows as the header. `yoy_growth()`, Opportunity Score and Market
  Tier still exist in `metrics.ts` but are no longer shown, since they depend on the
  two-month figure. Totals shown beside a change cover the same last 12 months.
- **FY2025 is provisional.** Complete fiscal years summed from the monthly nationality
  reports, rather than taken from the official annual tables, are marked "provisional (from
  monthly reports)" in Historical Trends: hollow chart markers, card labels and ranking
  headers (`provisionalFiscalYears()` in `lib/dashboard/periods.ts`).
- **Historical comparisons name their years and use FY2019 as the pre-pandemic base.**
  Historical Trends compares the latest year with the year before, its peak and FY2019, and
  shows a 10-year CAGR with both years; it no longer shows growth since FY1997 or a 5-year
  change from FY2020, the COVID low. Its cards say "by nationality" so they aren't confused
  with the consulate-based figures elsewhere.
- **Seasonality charts show the average per month.** With data through February, January
  and February have one more year of data than other months, so the Country Intelligence
  seasonality chart and the Consulate Intelligence heatmap and seasonality chart divide each
  month's total by the number of selected years that include it.
- **The partial calendar year is labelled.** Executive's annual chart shows the latest year
  as e.g. "2026 (Jan–Feb only)", lighter and hatched.
- **One country for the whole dashboard.** The sidebar's Focus Country, Country 360's
  Country, Historical Trends' country and Historical Consulates' country are one shared
  selection (in `DashboardContext`), over every country in either data source. A tab whose
  source has no rows for the country says "No consulate data for …" or "No nationality data
  for …" instead of going blank or showing another country. Consulate comparisons reset when
  the country changes. Country 360 and Historical Consulates open on F1. The sidebar's Visa
  Class control, which no tab read, is removed.
- **Risers and fallers need volume in both periods.** Command Center's movers and Consulate
  Intelligence's risers/fallers include only rows with at least 100 issuances in both
  12-month periods (`MOVER_MIN_ISSUANCES`), so tiny markets can't top the lists.
- **Long-term metrics use the latest complete fiscal year** (FY2025 today), so the
  year-to-date fiscal year never reads as a collapse.
- **Recovery Index compares the latest complete calendar year with 2019.** The original
  compared Jan–Sep 2025 with Jan–Sep 2019 because September was its latest month. The
  charts still show the partial current year as its own labelled point against 2019's same
  months.
- **The PDF/Excel era filter is gone.** The new files carry no source-format column.

## Tab changes

The AI, Strategy and Analytics tabs were removed in Feature 1; see git history. In Feature 3
the tabs app.py labelled "Consulates" and "Research: Country" were renamed "Country
Intelligence" and "Consulate Intelligence" to match their content.
