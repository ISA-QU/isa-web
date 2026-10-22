# Dashboard backlog

Remaining work on the Recruitment Intelligence dashboard, grouped by planned feature.
Work happens on `dev/dashboard-improvements`, one feature at a time; see
[dashboard.md](dashboard.md) for how the dashboard and its data work.

Done so far: 7 post renames (Feature 0), broken tabs removed (1), honest header (2),
12-month comparisons and fixed tab labels (3), periods/provisional FY2025/seasonality (4),
one shared country and F1 defaults (5a).

## 5b · Shared control bar

- [x] One control bar shared by every tab: Country, Visa (F1 / J1 / F1 + J1, default F1) and Period.
- [x] Keep the bar's state, and the active tab, in the URL.
- [x] Period presets for monthly consulate data: last 12 months vs previous 12 (default), last 24 months, a calendar year (partial years labelled), custom months anywhere in Mar 2017 – Feb 2026.
- [x] Fiscal-year range for nationality data: FY1997 – latest complete, FY2025 marked provisional.
- [x] Replace the sidebar Years filter with the Period control, built from the full monthly data.
- [x] Replace Country 360's "Recent Timeframe" and Historical Consulates' "Quick Range" with the shared Period (with a "Pre-pandemic 2019–2022" preset).
- [x] Replace the per-tab Visa controls with the shared Visa.
- [x] Move Compare Countries into Country Intelligence and Top-N into Consulate Intelligence; remove the sidebar.
- [ ] Decide whether to keep the fiscal-year range in the web address too (currently country, visa, period and tab only).
- [ ] State the period of every remaining number (from the checkpoint audit):
  - [x] Executive: treemap and monthly trend name the Period.
  - [ ] Executive: the focus card's Top Consulate and Peak Visa Month cover Jan 2024 – Feb 2026 without saying so on the card.
  - [x] Country Intelligence: Top F1 Consulates chart and monthly trend name the Period.
  - [x] Consulate Intelligence: Top-N chart, all-consulates table and its CSV name the Period.
  - [x] Country 360: Operational F1/J1 now follow the Period; Primary KPI cards each name their period; the leading-consulate line names the full history.
  - [ ] Country 360: Secondary KPI details (5-Year F1 Growth, Latest 12-Month F1/J1, shares, volatility), risk/concentration table, average/median-month chart, Key Risk and driver text, top-posts "Issuances" column.
  - [ ] Historical Consulates: Insights bullets and the Market Momentum / Recovery Status cards now use the full history, but don't name the months or recovery year.
- [x] Remove the remaining "Legacy" wording.

## 5c · Quick fixes from the full audit

- [x] Seasonality charts use a typical year (complete years except 2020–2021), tagged, with the Period as a gold line on Country Intelligence's chart; heatmap rows are the top 20 by typical-year volume.
- [x] Country 360: Period values replace the "Operational" figures; FY2025 marked provisional on its trajectory chart; recommended action shown once.
- [x] Globe follows the Period; Rotate button label fixed.
- [x] Historical Consulates: only the selected visa's cards; summary names the visa and period; annual view defaults to calendar-year totals.
- [x] One methodology panel ("How this is calculated") on every tab and a one-line footer; repeated "ignores the Period" captions removed.
- [x] Executive monthly trend as one continuous line.
- [x] Charts: axis labels no longer clipped; straight lines; month names on seasonality axes; readable date axis on Historical Consulates; Executive annual legend shows solid colors.

## 6 · Command Center

**Command Center will be rebuilt as the "Markets" page in the 5-page redesign (Feature 8), absorbing this feature.**

- [ ] Country 360 recommendation still uses the Jan 2024 – Feb 2026 operational inputs (shared with Command Center); rebuild with the Markets page.
- [ ] Flags fire for almost every market (e.g. 161 high-concentration, 160 highly seasonal); recalibrate the thresholds so flags discriminate.
- [ ] Review the market categories (Core, Growth, Emerging, Recovery, Watch, Declining) and the recommendation rules.
- [ ] Make the action queue's sort key visible, and rename the "Latest Comparable Period" view (it sorts by last-12-month volume).
- [ ] Label "Current Volume" and the "Minimum Current Volume" slider with their period (Jan 2024 – Feb 2026), or move them to the shared Period.
- [ ] Name the years in "Long-Term Growth" / "10-Year Growth" (FY2015 → FY2025), "Recovery Status" (2025 vs 2019), and the months in "Latest 12-Month" columns.
- [ ] Add years to the generated Evidence, Primary Driver and Counter-Signal text (`evidenceText`, `recommendationProfile` in `metrics.ts`).
- [ ] State the period (Mar 2017 – Feb 2026) on the Risk and Concentration Alerts metrics.
- [ ] Keep the action-queue idea; it is one of the parts worth keeping from V1.

## 4b · Events timeline

Sourced event markers on the Historical Trends chart.

- [ ] Research and draft the events, for example: 2001 9/11 and visa screening; 2008–09 financial crisis; 2010–15 China/India growth; 2016–17 decline; 2020 COVID; 2021–23 recovery; 2025 US visa-policy changes.
- [ ] Each marker has a date, one neutral line of description and a source link.
- [ ] Get the wording and sources approved before building.
- [ ] Build the markers on the Historical Trends chart.

## 7 · Monthly nationality data

- [x] Add monthly nationality rows to the snapshot (`nationalityMonthly`, local build and verify checks). Deploying the Lambda is in the handoff notes in dashboard.md.
- [ ] Montserrat and Western Sahara appear in the monthly nationality data but not in the annual table; handle them when a page first uses the table.
- [ ] Offer nationality-based 12-month figures alongside the consulate-based ones; the audit benchmark is F1 last 12 months 252,159 vs prior 385,674 by nationality (the consulate basis gives 252,282 vs 386,264).
- [ ] Coverage states instead of zero-fill: reported / reported-zero / absent / stopped (e.g. Burma, Iran, Afghanistan, Venezuela after Jun 2025). Missing rows are not zero.
- [ ] Compare FY2026 only on equivalent months (Oct–Feb: F1 −44.7%, J1 −10.8% vs FY2025).
- [ ] Never mix nationality (who received visas) and consulate (where they were issued) in one metric; label each.

## 8 · Five-page structure

**A page blueprint will be approved before building the 5 pages.**

- [ ] Draft and approve the page blueprint.
- [x] 8-1: merge Consulate Intelligence and Historical Consulates into one Consulates page.
- [ ] Remove the two unused tab files (`ResearchCountryTab.tsx`, `HistoricalConsulatesTab.tsx`) once 8-1 is accepted.
- [ ] Restructure into five experiences: Overview, Markets, Country 360, Consulates, Explore & Methodology.
- [ ] Carry over what works: Historical Consulates (best page), the Country 360 narrative, the Historical Trends 30-year chart, the Command Center action queue.
- [ ] Use the shared control bar (5b) on every page.

## 9 · Polish

- [ ] Complete the region mapping for all 205 countries so region presets include every country.
- [ ] Country flags: small flag icons next to country names in tables, cards and pickers, using a free flag set.
- [ ] Decide how flags show for non-country entries (e.g. Hong Kong, Macau, special categories).
- [ ] Globe improvements: it now follows the Period and the Rotate label is fixed (5c); review what else it should show.
- [ ] Card tooltips are native browser tooltips (slow to appear, not keyboard or touch accessible); consider an accessible tooltip.
- [ ] Remove code no longer shown: `growthLabel` / `summaryGrowthLabel`, `yoyGrowth` displays, `opportunityScore` / `marketTier`, the unused `includeOpportunity` methodology note, and `COUNTRY_COORDS` / the summary's `lat`/`lon` (kept so far because they feed shared calculations).
- [ ] If the Years/Period range grows, Country Intelligence's monthly trend (one line per year) will get crowded; redesign it.

## Data follow-ups

- [ ] Deploy `POST_ALIASES` (the 7 post renames) to the `rebuild-dashboard` Lambda. Source only so far; deploying needs approval and AWS access.
- [ ] Pending label decisions: St Lucia, Palau, Micronesia, Congo, Kuwait posts (Kuwait → Kuwait City), Astana / Nur-Sultan.
- [ ] Keep Serbia & Montenegro and Sudan as splits; never merge them.
- [ ] Keep special categories (including Palestinian Authority Travel Document) out of country rankings.
- [ ] Replace FY2025's provisional monthly-summed figures with the official annual table when available; known bridge-year exceptions: FY2019 F1 −1.47%, FY2020 J1 +1.07%.
- [ ] Avoid FY2020 as a comparison base; note that FY2015 (the 10-year base) is near the all-time peak.
- [ ] Curacao has a consulate but no nationality rows (its nationals are counted under the Netherlands); decide how to present it.

## Later projects

After launch.

- [ ] **News panel:** per-country and US visa-policy news from reliable sources (State Department, embassies, major outlets), clearly labelled as context.
  - [ ] Needs a small secure backend to hold the news-service key.
- [ ] **Slate integration:** aggregated Quinnipiac counts (applications, admits, deposits by country and term) compared with market visa trends.
  - [ ] Needs university IT and data-governance approval; start that conversation early.
  - [ ] Aggregated data only, behind sign-in.

## Later ideas

- [ ] Monthly "what changed" email digest.
- [ ] One-click country briefing PDF.
- [ ] Upload new monthly data from the dashboard.
