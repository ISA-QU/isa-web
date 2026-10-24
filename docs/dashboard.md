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

### The snapshot's tables

| Table | Rows (today) | What it holds |
|---|---|---|
| `postsMonthly` | 41,965 | F1/J1 issuances by consulate (post) and month, Mar 2017 onward: **where** visas were issued |
| `annualCountry` | 11,367 | F1/J1 by nationality and fiscal year, FY1997 onward, countries only |
| `nationalityMonthly` | 35,967 | F1/J1 by nationality and month, Mar 2017 onward: **who** received visas |

`nationalityMonthly` (Feature 7) is built from the monthly nationality file by
`_build_nationality_monthly()` in the rebuild Lambda. It is dictionary-encoded like
`postsMonthly`: `dims.country` lists each name once and `cols` holds `year`, `month`,
`country` (an index into `dims.country`), `visa` (0 = F1, 1 = J1) and `issuances`.

- Country names go through `NATIONALITY_ALIASES`, so they match the post data and the annual
  table. Rows that unify to the same country, month and visa are added together.
- Special reporting categories (`SPECIAL_REPORTING_NAMES` plus anything the file marks as not
  a "country or area", e.g. Palestinian Authority Travel Document, Unknown) keep their own
  names and are listed in `dims.nonCountry` (always a subset of `dims.country`): identifiable,
  but outside the country market universe. The decoder marks them `isCountry: false`.
- Its coverage is `coverage.nationalityMonthly`; `validation.nationalityMonthly` records rows,
  months, countries, F1/J1 totals and the special-category totals.
- **Nothing displays it yet.** The frontend decodes it to `DashboardData.nationalityMonthly`,
  or `null` when a snapshot lacks the table (e.g. one built before Feature 7) or it is
  malformed; the dashboard works the same either way. The schema stays
  `dashboard-snapshot@1` because the table is optional.
- It adds about 53 KB to the gzipped snapshot (90,588 → 143,731 bytes; raw 971,389 →
  1,532,998).

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
- that every historical metric is measured from the latest *complete* fiscal year;
- the monthly nationality table against audit figures (fixed months): F1 countries-only
  252,159 (Mar 2025 – Feb 2026) and 385,674 (Mar 2024 – Feb 2025); India F1 30,292 vs
  75,060 (−59.6%); monthly world totals within 5 of the post totals (202 of 216 month/visa
  pairs exact); FY2025 monthly sums 287,915 F1 / 292,742 J1 (all rows) and, countries only,
  equal to the annual table (287,520 / 292,418).
- Fix Pack A1 (rules above), against figures recounted with pandas from the raw by-post
  workbook: Venezuela 0 / low volume / low volume and "Insufficient Evidence"; Russia 5 vs
  21, low volume, recovery 0.1; Myanmar 130 vs 1,705, −92.4%, 25.2; Ukraine recovery 1.1;
  Nepal tops Recovery Leaders at 323 (Guinea and Eritrea left out); Kinshasa −88.8%; 26
  countries' F1 change now low volume; Country 360 and Command Center agree for every
  country; risers and fallers unchanged; `period=2010` rejected; `country=china` opens China.
- Fix Pack A2, against pandas recounts: India's typical year unchanged (Jan 1,893, May
  5,526, Aug 6,903); peaks India/China June, Ukraine/Egypt/Pakistan July, Mumbai June;
  Mauritania and Afghanistan low volume (31 F1 countries, 41 consulates); every page's peak
  agrees with Command Center; Rangoon 10.8, Caracas 29.7, Mumbai 1,503 per month; Moscow
  1.54 and Kyiv 1.12 (High); Russia 2.02; Moscow's trend has 108 points; Kabul's recovery
  runs to 2025 at 0; no F1 or F1 + J1 category or action changes (Canada J1 accepted).
- 8-2b, against pandas recounts of the raw monthly nationality workbook: India nationals
  30,292 vs 75,060 (−59.6%, recovery 67; F1 + J1 37,255, −56.9%, 69); Iran 191 vs 2,331
  (−91.8%, 13); Venezuela 87 vs 734 (−88.1%, 16; issued in 0); Nigeria, Russia, Ukraine,
  UAE, UK, China and Ghana; compare default China, India, Vietnam, South Korea, France;
  small and collapsing markets (F1: 25 fell below 100, 57 under 100 in both, 85 with timing
  hidden); 44 countries get the "mostly elsewhere" note; the fallbacks; Montserrat and
  Western Sahara left out. The advice fingerprints lock every country's category/action.
- 8-3 Markets, against pandas recounts with the rules re-implemented: categories (F1: Core
  8, Growth 8, Emerging 0, Recovery 11, Declining 25, Watch 111, Restricted 40 — 38 travel
  ban, 2 pause), the Core list, flag counts, the example rows (Nigeria, Zimbabwe, Uganda,
  DR Congo, South Sudan, Turkmenistan, Ghana, India, China, Vietnam), the Travel Timing
  list (64), movers by nationality, India's 2024 vs 2023 Period figures, the restriction
  names, and `tab=command` opening Markets.

## Architecture

```
app/
  page.tsx, dashboard/page.tsx     -> DashboardShell
  components/dashboard/
    DashboardShell.tsx             tab bar, header, nav buttons, web-address sync
    DashboardContext.tsx           shared selection (country, visa, period) + derived rollups
    ControlBar.tsx                 the control bar: country, visa, period / fiscal years
    ComparePicker.tsx              type-to-search picker with chips and presets
    HeaderKpis.tsx
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

## Shared number rules (Fix Pack A)

Every page works these out the same way, through `lib/dashboard/measures.ts`, so no page
has its own version:

- **Data end, not a country's own last row.** "Last 12 months" always ends at the data's
  last month (`coverage.postsMonthly.end`, Feb 2026 today) and "latest complete year" is
  the last calendar year fully inside the coverage (2025), for every country and
  consulate. A consulate that stopped reporting (Caracas, Jan 2019; Kabul, Aug 2021) counts
  0 for the months after, rather than being measured over an earlier window.
- **Minimum base of 100.** A % change is shown only when the previous period had at least
  100 issuances, and a recovery index (latest complete year vs 2019) only when 2019 had at
  least 100. Otherwise the page shows "— (low volume)". Only the earlier side needs 100,
  so a big base falling to almost nothing still shows (Myanmar ▼ 92.4%; Moscow recovery
  0.2). This applies on Country 360, Consulates, Command Center (momentum and Recovery
  Leaders), the header country cards and the globe. Risers and fallers keep their own rule
  (100 in both periods).
- **One "What to do".** Country 360 takes its row from `buildCommandCenterFrame()` for its
  one country, so it always gives the same advice as Command Center. A country with no
  visas issued in it in the last 12 months gets "Insufficient Evidence" with the reason
  "No visas issued locally in the last 12 months".
- **Missing month = 0 (A2).** Averages per month, volatility, seasonality CV and every
  monthly trend line use every month in the range, with months that have no rows as 0, so
  a line drops to 0 instead of jumping across a gap. "Average per month" divides by the
  months in the Period (Rangoon, last 12 months: 10.8, not 21.7); "Months with issuances"
  still counts only months with visas. Averages show one decimal under 100.
- **One peak month (A2).** Every page takes its peak month and seasonality ratio from
  `typicalYear()`: the average per calendar month over the typical years (complete years
  except 2020–2021: 2018, 2019, 2022–2025), missing months as 0, and labels it "Peak month
  (typical year)". Below 100 visas in an average typical year it shows "— (low volume)"
  and no seasonality ratio or "Highly Seasonal" flag. A country with no visas issued
  locally in the last 12 months gets no Timing line or timing-based advice.
- **Country 360 by nationality (8-2b).** Country 360 leads with the country's nationals
  (the monthly nationality table: the passport the visa was issued to, wherever it was
  issued), with "Issued in [country]" (its U.S. consulates) alongside: a line under the
  cards, a dotted line on the monthly trend, and the consulate-concentration figures.
  "What to do" comes from `nationalitySignals()`: the shared classifier and rules, without
  consulate concentration, plus two rules that come first: under 100 nationals in the last
  12 months after 100+ before → "Declining / Review Structural Decline" ("Fell from X to
  Y visas to nationals of [country]"); under 100 in both → "Insufficient Evidence". Those, and any fall of 75% or more, hide
  the Timing line and timing-based advice. The change card follows the Period against the
  previous equal-length period. With no nationality table (or no rows for the country,
  e.g. Curacao) the page shows a banner and uses the issued-in figures. Markets (8-3) uses
  the same rows, so the two pages agree; the header's country card is labelled "Issued in
  [country]".
- **Markets (8-3).** The Command Center became the Markets page (`?tab=markets`; old
  `?tab=command` links still open it). It lists every country by nationality from the same
  `nationalitySignals()` rows as Country 360, so the two pages agree: six columns
  (country, nationals in the Period, change vs the previous equal-length period, 10-year
  trend, action with category, timing), category counts, Travel Timing Opportunities
  (ordered by the next outreach window from today's month), 12-month movers by nationality,
  and everything else under More details and in the CSV. The 26-month "Current Volume" is
  gone. Thresholds were recalibrated for the 12-month measure (`MARKET_THRESHOLDS` in
  `metrics.ts`; one set for F1, J1 and Both): Core 5,000+ in the last 12 months and not
  structurally declining; Declining needs 250+ in the previous 12 months; flags only from
  100 nationals, with Highly Seasonal at 3.0x, Volatile at CV 1.2 and Weak Recent Momentum
  at −35% (falling faster than all F1 nationals). Consulate concentration and the every-row
  partial-year caution are no longer flags.
- **Visa restrictions (8-3).** `lib/dashboard/restrictions.ts` lists, per country and
  restriction, the type, level, the date student and exchange (F, M, J) visas have been
  suspended since, a one-line history, the State Department sources and when it was last
  checked. Proclamation 10998 (1 Jan 2026) continued Proclamation 10949 (9 Jun 2025): 18
  countries have been suspended since 9 Jun 2025 and 20 since 1 Jan 2026 (19 full, 19
  partial today). Turkmenistan's student and exchange visas were suspended 9 Jun – 31 Dec
  2025 and restored on 1 Jan 2026 (immigrant visas only since). Uganda, DR Congo and South
  Sudan have a temporary pause of all visa services from 18 May 2026 (Ebola).
  `nationalitySignals()` checks it first: a country whose student and exchange visas are
  blocked is "Restricted", with Timing and timing-based advice hidden and no place in
  Core/Growth/Emerging/Recovery or the Travel Timing list; Turkmenistan is "Watch" with a
  "restored" note and timing hidden. Badges (red full, amber partial, purple pause, grey
  restored) show on Markets (main table and movers), Country 360 and the Historical Trends
  tables, with the history and sources in the tooltip. Consulates shows a note in "This
  country" scope and a purple "paused" badge on the Kampala, Kinshasa and Juba rows and
  detail; the Executive focus card and globe hover add one line. The Markets and Country
  360 rankings CSVs have "Restriction" and "Suspended since" columns. Numbers and charts
  are unchanged. Update `LAST_CHECKED` when the list is reviewed.
- **Events timeline (2a).** `lib/dashboard/events.ts` lists dated, sourced events
  (id, start and optional end, precision day/month/year, label of at most 40
  characters, one-sentence description, scope "global" or country names, importance
  major/detail, source, last checked). The travel bans (Proclamations 10949 and
  10998), the Ebola visa-services pause and Turkmenistan's restored student and
  exchange visas are built from `restrictions.ts`, so dates and counts live in one
  place. `eventOverlay()` places them: a thin dashed line (dotted for hover-only
  events) or a shaded band for ranges; labels for global "major" and country events
  in up to three rows above the plot (a label that doesn't fit becomes hover-only,
  and events in the same month or year share one label, e.g. "Interview pause +4");
  hover shows the description, date and source site. Fiscal-year charts place each
  event in its Oct–Sep year (2014-11-12 → FY2015); a year-only event uses the same
  FY number (2005 → FY2005). COVID (G6) is hover-only on yearly charts, which keep
  their red 2020 band. Nothing is drawn outside a chart's range or after the data
  ends; later events are listed under the chart. Shown on Historical Trends (global
  major + the country's), Country 360's monthly trend, long-term trajectory and
  recovery chart (all global + the country's) and the Consulates trend in monthly
  mode with "This country" scope (global major + the country's). One "Show events"
  setting is shared by every chart's checkbox and written to the link as
  `events=off` when off. Each chart has a collapsed "Events on this chart (N)" list
  with clickable sources. Existing chart data and decorations are unchanged.
- **Links are checked.** A `period=` year or range entirely outside the data (e.g.
  `period=2010`) or with a month outside 1–12 falls back to the last 12 months, and
  `country=` ignores capitalisation (`country=china` opens China).
- **Consulates with no visas in the Period (fix pack 9).** In "This country" scope,
  when the country's consulates issued none of the selected visas in the Period but
  have F1 or J1 history (F1, last 12 months: Afghanistan, Belarus, Lesotho,
  Micronesia, South Sudan, Sudan, Venezuela), every such consulate is listed with 0
  and a "Last F1 issuance" column, the trend defaults to them, and a line at the top
  says "No U.S. F1 visas have been issued in Afghanistan since Aug 2021." It names
  the visa class because the data has F1 and J1 only, and adds the other class's
  last month when that is later (Juba: none F1, J1 Mar 2025). A matching event
  (`consulate` on C6 Caracas, C7 Moscow, C8 Kabul) adds its note and source.
- **Restriction note, last sentence** (`consulateScopeNotes(country, status)`):
  "may still issue visas to other nationalities" only when the country's consulates
  issued F1 or J1 in the last 12 months and visa services are not paused; "There are
  currently no U.S. visa services in X" when they issued none or are paused
  (Afghanistan, South Sudan, Sudan, Venezuela); "There is no U.S. consulate issuing
  visas in X" with no consulate in the data (Antigua and Barbuda, Dominica, Iran,
  Libya, Somalia, Syria, Tonga, Yemen).
- **Country 360 display rules** (`lib/dashboard/country360.ts`, display only; the
  category, flags and action keep their inputs, and the advice fingerprints are
  unchanged). The 10- and 5-year growth cards show "— (low volume)" when the earlier
  fiscal year is under 100 (North Korea FY2015: 1), the summary leaves that growth
  out, and "Why"/"But" are written as if there were no 10-year growth. Confidence
  shows "Low" when the last 12 months or the 12 before are under 100. A country
  with no nationality rows at all (Curacao: residents hold Dutch passports) shows
  "—" for nationality figures with "No nationality figures for Curacao in the State
  Department data; showing visas issued in Curacao." CSV exports are unchanged.
- **Market cycles (2b-1).** Top of Historical Trends (`lib/dashboard/cycles.ts`,
  `components/dashboard/MarketCycles.tsx`); information only, no existing figure
  changes. World and "World excluding mainland China" by nationality, countries only,
  FY1997 to the latest complete year (FY2025, provisional and hollow-marked; the
  partial FY2026 is left off), following the Visa control. Downturn rule: a year 20%+
  below the highest year so far (since FY1997) starts a downturn, which ends when that
  peak is regained; a zero year is never a peak. Grey bands run peak → trough on the
  World line ("▼ 26% · regained FY2007"). The recovery summary is always F1, over
  countries with 500+ in their best year (dashboard names): 101 markets, 196
  downturns, 110 recovered (56%), median 3 years from the low; peaks in FY2000–02: 32
  of 44 (median 4); post-COVID 43 of 74 above FY2019 in FY2023. With the raw
  workbook's unmerged Congo names it is 195 / 109 and 31 of 43. The latest signal
  compares the fiscal year so far with the same months a year earlier (monthly
  nationality data, special categories out, so the Palestinian Authority Travel
  Document, labelled "Country or area" in the monthly workbook, is excluded): "no sign
  of a bottom yet" while each of the latest 3 months is 20%+ below a year earlier,
  otherwise "the decline is narrowing". World and selected-country downturn tables show
  peak, trough, depth, rebound within 3 years of the trough, the year regained and
  any later new high; FY2025 values and "not yet" are marked provisional. Event lines
  on every chart are now purple like the ◆ markers, with a "┆ events — hover ◆ for
  details" hint beside the Show events checkbox.

## Choices the data forced

- **The header cards use a rolling 12 months.** The five cards above the tabs compare the
  latest 12 months of consulate data with the 12 months before (e.g. Mar 2025 – Feb 2026
  vs Mar 2024 – Feb 2025), from `rollingTwelveMonths()` in `lib/dashboard/rolling.ts`.
  They ignore the Period control. The heading above them names the period, and
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
- **A control bar at the top.** Country (searchable, every country in either source) and
  Visa (F1 / J1 / F1 + J1, default F1) apply to every tab, with a "Showing: …" summary line
  and a reset (`ControlBar.tsx`). The country, visa and active tab are kept in the web
  address (`?country=India&visa=f1&tab=executive`), so a view can be shared and survives a
  reload. Charts labelled with a visa follow the bar's choice; the header, risers/fallers,
  the globe and the 12-month rankings stay F1 (or F1 and J1).
- **One Period for monthly consulate data.** The control bar's Period (last 12 months by
  default; last 24 months; a calendar year, partial years labelled; custom months; All since
  Mar 2017; pre-pandemic through recovery 2019–2022) replaces the sidebar Years filter,
  Country 360's Recent Timeframe and Historical Consulates' Quick Range. Period-following
  data comes from the full monthly consulate history, not the operational layer. On
  Historical Trends the same slot holds the fiscal-year range. Sections that don't follow the
  Period carry a small tag (e.g. "Always last 12 months", "All calendar years"); Historical
  Consulates' 12-month, change and recovery columns, trend chart, annual and recovery charts
  always use the full history, with the Period shaded on the trend chart. CSV file names
  include the period.
- **Seasonality uses a typical year.** Country Intelligence's seasonality chart, Consulate
  Intelligence's heatmap and Consulate Seasonality average over complete calendar years
  except 2020–2021 (COVID), e.g. 2018, 2019, 2022–2025 (`typicalYears()` in
  `lib/dashboard/periods.ts`), whatever the Period, tagged "Typical year: …". Country
  Intelligence's chart overlays the selected Period as a gold line. The heatmap's rows are
  the top 20 consulates by typical-year volume.
- **Country 360 and the globe follow the Period.** Country 360's former "Operational" F1/J1
  figures and first summary line use the Period; its recommendation still uses the Jan 2024
  onward operational inputs shared with Command Center. FY2025 is marked provisional on its
  trajectory chart, and the recommended action appears once. The Executive globe's totals,
  colors, top consulate and peak month follow the Period; its change line and the focus card
  stay on the last 12 months.
- **Methodology once.** "How this is calculated" (with the data-scope paragraph) appears once,
  under every tab, and the footer is one line. Chart axes grow to fit long labels, line
  charts use straight lines, and Historical Consulates uses a real date axis.
- **No sidebar.** Compare Countries now lives in Country Intelligence's comparison chart (a
  type-to-search picker with chips, a "Top 5 markets" preset, one preset per region, up to 8
  countries; default: the top 5 markets by F1 in the Period), and Top-N in Consulate
  Intelligence. Country 360's Compare Consulates and Historical Consulates' Compare Posts
  use the same picker. Command Center's
  "Analysis View" is now "Sort by" (last-12-month volume / long-term growth / momentum).
- **One country for the whole dashboard.** The control bar's Country is the only country
  control; every tab reads the same shared selection (in `DashboardContext`), over every
  country in either data source. A tab whose
  source has no rows for the country says "No consulate data for …" or "No nationality data
  for …" instead of going blank or showing another country. Consulate comparisons reset when
  the country changes. Country 360 and Historical Consulates open on F1.
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

In Feature 8-1, **Consulate Intelligence and Historical Consulates were merged into one
"Consulates" page** (`tabs/ConsulatesPage.tsx`; calculations in `lib/dashboard/consulates.ts`).
Old links with `tab=consulate-intelligence` or `tab=historical-consulates` open it
(`lib/dashboard/url.ts`). The page's own address settings are `consulate=` and
`scope=country|all`. The two old tab files are no longer used.

The Consulates page, top to bottom:
- **Scope:** "This country" (consulates located in the control bar's country) or "All
  countries". Follows Visa and Period. A context line (This country only, and only when the
  snapshot has `nationalityMonthly`) sets visas issued by consulates in the country beside
  visas received by its citizens worldwide, for the same period, and says they measure
  different things.
- **Ranked consulates:** volume in the Period, change vs the previous period of equal length,
  share of the scope total, and recovery (latest complete year vs 2019, 100 = 2019 level).
  Change and recovery show "—" when a side has fewer than 100 issuances or there is no
  complete earlier period (e.g. Period = All). Click a row, or use the picker, to select.
- **Trend:** Monthly (Mar 2017 onward, Period shaded), Annual (calendar years, partial years
  labelled) or "Same months each year" (the months the latest year has so far, worked out from
  the data). Top 3/5/8 by Period volume (default 5) or picked consulates (up to 8).
- **Risers and fallers:** always the last 12 months, F1, 100 in both periods; follows the Scope.
- **Seasonality:** typical-year heatmap; all consulates in the country, or the Top-N for All
  countries.
- **Consulate detail:** five cards (volume, change, share of its country, recovery, peak month
  in a typical year) and a collapsed "More details" (latest month, monthly average, F1/J1
  split, recovery by year, admissions notes, source rows and CSVs).
- Dropped from the old pages: the four "strongest/most" cards, the Average/Median/Maximum
  seasonality statistic, the "recovery from visible range" checkbox, the duplicate country
  seasonality chart and the intro and Active Range panels.

In Feature 8-2a, **Country Intelligence was merged into Country 360**, so each country has one
page (layout only; every number is unchanged and still consulate-based). Old links with
`tab=country-intelligence` open Country 360. `tabs/ConsulatesTab.tsx` is no longer used.

Country 360, top to bottom:
- **Primary KPIs** (each names its period; Recovery says "100 = 2019 level").
- **Leading consulate:** the leader in the Period and over the full history (one line when the
  Period is All), computed exactly as on the Consulates page, with a "See all consulates" link
  that opens Consulates with `scope=country`.
- **Monthly trend** Mar 2017 onward, Period shaded, real date axis; F1 + J1 shows two lines.
- **Compare countries** (top 5, region presets, up to 8) and **typical-year seasonality** with
  the Period as a gold line, both moved unchanged from Country Intelligence.
- **Long-term country trajectory** (fiscal years, its own slider), kept visible.
- **What to do:** the recommended action, why, what to watch, timing and caveats, once.
- **More details:** secondary KPIs (including Active Posts and Seasonality CV), summary, recovery
  chart, risk table, all-country rankings, CSVs and methodology.
- Dropped as duplicates: the period-only trend, the top-posts table, the consulate network
  and compare-consulates charts and Top F1 Consulates (all on the Consulates page), the
  stacked-by-year trend and F1 vs J1 chart (merged into the monthly trend), the full-history
  average/median month chart (the typical-year chart is kept; its CSV stays), the F1-only
  change card, and the separate recommendation cards.

## Handoff notes for deployment (Koushik)

The branch `dev/dashboard-improvements` changes the **`rebuild-dashboard` Lambda**. Nothing
in AWS has been changed yet; these are the steps when it is deployed.

**What changed in the Lambda** (`backend/lambdas/rebuild-dashboard/lambda_function.py`):
1. **Feature 0, post renames.** `POST_ALIASES` maps 7 older consulate labels to current
   names (`Mumbai (Bombay)` → `Mumbai`, `Chennai ( Madras)` and `Chennai (Madras)` →
   `Chennai`, `Rio De Janeiro` → `Rio de Janeiro`, `Dar Es Salaam` → `Dar es Salaam`,
   `Port Of Spain` → `Port of Spain`, `Port Au Prince` → `Port-au-Prince`). The rebuild
   output gains a `renamed` line, and the build stops if an old and a current label report
   the same month and visa.
2. **Feature 7, monthly nationality table.** The snapshot gains `nationalityMonthly` and
   `validation.nationalityMonthly`; the rebuild output gains a `nationalityMonthly` line.

**Steps**
1. Open the `rebuild-dashboard` function in the console (us-east-1), replace the code with the
   branch's `lambda_function.py`, and **Deploy**. Keep the `BUCKET` line as it is in AWS if it
   differs from the file.
2. No new permissions, raw files, environment variables or layers are needed. Memory
   (1024 MB) and timeout (1 min) are fine: the local build takes about 3 seconds.
3. Run the **Test** event (`{}`). Expect `"ok": true`, `"warnings": []`,
   `"postsMonthly": "41965 rows, ..."` (up from 41,524 before the renames) and
   `"nationalityMonthly": "35967 rows, 2017-03 to 2026-02"` with the current raw files.
   `snapshot/snapshot.json.gz` grows to about 145 KB.
4. Optional check: download the snapshot, gunzip it to `public/dashboard-data/snapshot.json`
   and run `npm run dashboard:verify` (70 checks).

**Unchanged:** the `get-dashboard` Lambda, API Gateway routes and authorizer, CORS, Cognito
and the S3 bucket layout. The served response (about 190 KB base64) is far below Lambda's
6 MB limit.

**Repository clean-up:** `backend/lambdas/rebuild-dashboard/__pycache__/lambda_function.cpython-314.pyc`
is committed on main; consider removing it and adding `__pycache__/` to `.gitignore`.

**Order doesn't matter.** The site reads snapshots with or without `nationalityMonthly`, and
the current site ignores the new table, so the Lambda and the site (`npm run deploy`) can be
deployed in either order. Until the Lambda is redeployed, the live snapshot keeps the 7 old
post labels unmapped (as warnings) and has no monthly nationality table.

