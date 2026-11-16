# Recruitment Intelligence Dashboard: user guide

For the admissions team. It explains what each tab answers, how to read the numbers, and
what they can't tell you. The person who maintains the dashboard should read the
[runbook](RUNBOOK.md) instead.

The dashboard shows **U.S. visa issuances worldwide** from the U.S. Department of State: F1
(student) and J1 (exchange visitor) visas, by nationality (the passport) and by the U.S.
consulate that issued them, month by month since March 2017 and year by year since FY1997.
It is **not** Quinnipiac's own applicant or enrolment data.

The tab descriptions below are the same wording the Bobcat assistant uses, so the guide and
the Bobcat always agree.

## Signing in

Open the dashboard's link (the international admissions manager has it) and sign in with your
email and password. **Forgot password?** on the sign-in page emails you a reset code. If you
don't have an account, ask the international admissions manager; accounts are created by the
IT/AWS contact. Never share your password.

## The tabs

### Markets

Markets lists every country by nationality with its category, what to do and timing. Narrow it with Region, Category, Sort by and the minimum-nationals slider; More details has every column.

**Use it when** you want to know where to focus: the largest markets, the fastest-growing,
the biggest declines, or every market in one region. Below the table: Travel Timing
Opportunities (the next outreach windows) and the Latest 12-Month Movers.

### Executive

Executive has the interactive globe (drag to rotate, hover a country for its F1 and J1 totals) with a focus card for the selected country, plus yearly and monthly charts.

**Use it when** you need a picture for a meeting or a quick look at one country. The globe
counts visas by where they were issued.

### Country 360

Country 360 covers one country in depth: its nationals in the last 12 months, the monthly trend, the long-term trajectory and What to do. It follows the Country control at the top.

**Use it when** you're preparing a trip or a country review. "What to do" gives the advice,
its reasons and the country's history label in plain words.

### Consulates

Consulates ranks the U.S. consulates that issued the visas, for the selected country or all countries (the Scope switch), with change, share and recovery; pick a consulate for its detail.

**Use it when** you want to know where students from a country get their visas, or which
consulates are busiest.

### Historical Trends

Historical Trends shows 30 years of annual visas by nationality: the country cards, Market cycles (downturns and recoveries, and the country compared with the world) and the growing and declining rankings.

**Use it when** you want to know whether a drop is unusual. Two parts sit at the top:

- **Market cycles.** A downturn starts when a fiscal year is 20%+ below the highest year so far and ends when that peak is regained. Rebound: the best year within 3 years of the low, vs the low.
  The recovery summary says how often past downturns fully recovered (always F1), and the
  latest signal compares the fiscal year so far with the same months a year earlier: "No sign of a bottom yet" while each of the latest 3 months is 20%+ below a year earlier; otherwise "the decline is narrowing".
- **Country vs world.** The selected country against all countries, for the same visas, as an
  index: Both lines are set to 100 in FY2019, the last year before COVID. 92 means 8% below FY2019; 200 means double. "About in line with the market" means within 2 percentage points of the world.
  One sentence under the chart compares last year and the change since FY2019.

## The controls

The Country control at the top sets the country every tab follows; type to search. Reset to defaults goes back to India, F1 and the last 12 months.

The Visa control at the top switches the tabs between F1 (students), J1 (exchange visitors) and F1 + J1.

The Period control at the top sets the months for figures marked "Follows Period": the last 12 or 24 months, a calendar year, custom months, all data or 2019–2022. On Historical Trends it becomes a fiscal-year range.

Tick Show events above a chart to draw dated events (travel bans, COVID and others) on it; hover a ◆ for the details and source. One setting covers every chart.

Country 360's Compare countries chart shows the top five markets by default; pick up to eight in its picker. Historical Trends → Market cycles compares the selected country with the world.

**Region** (on Markets) groups countries into South Asia, Central Asia, East Asia, SE Asia,
Middle East, Europe, Africa, Latin America, and N. America / Oceania. Figures marked
"Fixed" ignore the Period control and say which period they use.

## Downloads and badges

Tables have a Download … CSV button under them (Markets, Consulates, Historical Trends, and Country 360's Downloads section); it saves the rows the table shows with your filters.

A red (full) or amber (partial) Travel ban badge means the country's student and exchange visas are suspended; grey means they aren't affected (restored, immigrant visas only). Hover a badge for the proclamation, its source and when it was last checked.

A purple Paused badge means all U.S. visa services are paused in that country (Uganda, DR Congo, South Sudan since 18 May 2026); on Consulates it shows on the Kampala, Kinshasa, Juba rows.

"— (low volume)" appears where the earlier figure had fewer than 100 visas, because a % change of a tiny number says little.

Provisional marks the latest complete fiscal year, drawn with hollow markers on the yearly charts: it's summed from the monthly reports until official annual figures replace it.

## History labels

Each country's history label (Structural, Gradual, Cyclical or Too early to tell) is in Markets' History (F1) column (hover it for the evidence), under What to do on Country 360, and in Historical Trends → Market cycles.

They're background only, from each country's F1 history, and don't change the category or the
advice:

- Structural — long decline: the peak is 8+ years old and the latest year is under 50% of it.
- Gradual long decline: the same, at 50%–80%.
- Cyclical — has recovered before: an earlier 20%+ downturn regained its peak.
- Too early to tell: a best F1 year under 500, or none of these.

## The market categories

Every country gets one category, from its last 12 months and its long-term history. The rules,
exactly as the dashboard applies them:

Checked in this order. Restricted: student and exchange visas blocked by a travel ban or a pause of visa services. Core: 5,000+ in the last 12 months and not structurally declining. Declining: 10-year trend -35% or worse and last-12-month change -20% or worse, with 250+ in the previous 12 months (also a market that fell below 100 from 100+). Emerging: change +25% or more with 250–4,999 in the last 12 months. Growth: 10-year trend +50% or more with 500+. Recovery: recovery index 115+ with 500+. Watch: everything else.

**Why a category can disagree with the last-12-months %.** The first rule that fits wins, and
most categories look at the 10-year trend, not just the last year. Kyrgyzstan (F1, data
through February 2026) is **Growth** with **▼ 61.8%**: its nationals fell from 1,816 to 694
in the last 12 months, but its 10-year trend (FY2015 → FY2025) is ▲ 583.4% with 500+ in the
last 12 months, so the Growth rule applies. It isn't Declining, because that needs a 10-year
trend of −35% or worse. Its "What to do" says "Monitor Current Slowdown", which is where the
recent fall shows up. Read the category and the % change together.

## Other terms

- **Last 12 months:** The 12 months ending at the data's last month, the same for every country and consulate. "Previous 12 months" is the 12 months before that.
- **Nationals:** Visas counted by the passport they were issued to, wherever in the world they were issued. Markets and Country 360 lead with this measure.
- **Issued in:** Visas counted by the U.S. consulate that issued them, in that country. A country's nationals can also get visas elsewhere, so this differs from nationals. Consulates uses this measure.
- **Recovery index:** The latest complete calendar year as a share of 2019, the last year before COVID: 100 is the 2019 level, 80 means 20% below it. Shown only when 2019 had at least 100 visas.
- **10-year and 5-year trend:** The % change in visas by nationality from the fiscal year 10 (or 5) years before the latest complete one. "— (low volume)" when that earlier year had under 100.
- **Peak month (typical year):** The calendar month with the most visas on average over the typical years (complete years except 2020–2021), counting missing months as 0. Timing advice is built from it.

## Planning a recruitment trip

Five steps, all with what the dashboard has today (examples: F1, data through February 2026):

1. **Check restrictions first.** On Markets, set Category to "Restricted", or ask the Bobcat
   "Which countries have a travel ban?". Don't plan student recruitment where F1/J1 visas are
   suspended or paused (for example Nigeria: travel ban since 1 Jan 2026).
2. **Find markets that are holding up.** Sort Markets by Change, and check Historical Trends →
   Country vs world: "ahead of the market" means the country fell less than the world. Brazil
   is Core and nearly flat (▼ 0.6% in the last 12 months); Vietnam is ahead of the market since
   FY2019 (▼ 4.7% vs the world's ▼ 21.0%).
3. **Pick the timing.** Markets → Travel Timing Opportunities, or the Timing line in Country
   360's What to do (Brazil: "March-May outreach before July peak").
4. **Pick the cities.** Consulates, with the country selected and "This country": where its
   students get their visas (Brazil: Sao Paulo issued 52.3% of Brazil's F1 visas).
5. **Compare with our own numbers.** The dashboard shows the market, not Quinnipiac. Check our
   own applicant counts for the country before deciding.

## What not to conclude

- **These are U.S.-wide visa issuances, not Quinnipiac's numbers.** A country falling here
  doesn't mean Quinnipiac's applicants from it are falling, and the dashboard has no
  applicant, admission or enrolment data.
- **A visa issued isn't a student enrolled**, and visas are counted when issued, not when the
  student arrives.
- **The latest fiscal year is provisional** (FY2025 today): it's summed from monthly reports and
  will be replaced by the official annual figures, which can differ.
- **History labels are background, not forecasts.** "Cyclical" means a country recovered
  before, not that it will again; past recoveries don't guarantee future ones.
- **Events "may have affected" trends**; the dashboard never says they caused them.
- **Travel-ban and pause notes aren't legal advice**; check the State Department source in the
  badge before acting.
- **Nationals and issued-in figures measure different things** (who received the visa vs where
  it was issued), so they won't match.
- **Small numbers swing a lot**; that's why changes from under 100 show "— (low volume)".

## The Bobcat assistant

The Bobcat button (bottom-right on every tab) opens a small chat that answers questions about
the dashboard. It's **free and runs in your browser**: there's **no AI model**, and it **sends
nothing anywhere and keeps nothing** (the chat disappears when you close it). It answers only
from the dashboard's own data, with the same numbers as the tabs, and every answer says which
tab, measure and period it comes from, with an **Open tab** button that shows the same figures.

Questions it answers (all tested):

- "How is India doing?" · "Tell me about Nepal"
- "Fastest-growing markets" · "Top growing in Africa" · "Biggest declines"
- "Which markets are Emerging?" · "Which countries have a travel ban?"
- "Is China's decline structural?" · "How does Nepal compare with the world?"
- "Where do Indians get visas?" · "What happened in 2020?"
- "What's provisional?" · "Where can I download a CSV?"
- Follow-ups like "And China?" or "What about J1?"

What it can't answer: applicants, admissions or enrolments, Slate, writing emails or replies,
forecasts ("What will FY2027 be?"), and visa or legal advice. For those it says "I don't know —
the dashboard doesn't have that" and suggests questions it can answer. Questions with "we" or
"our" about trends get a reminder that the data is U.S.-wide, not Quinnipiac's own.

## Getting help

Ask the international admissions manager first. Problems with the data or the dashboard go to
the repo owner, who follows the [runbook](RUNBOOK.md).
