# Recruitment Intelligence Dashboard: runbook

The routine for whoever maintains the dashboard: the monthly data update, the monthly checks,
the yearly step, small fixes, and what to do when something goes wrong. It's written for
students who aren't programmers; follow it step by step. The people who *use* the dashboard
have the [user guide](USER_GUIDE.md). The technical detail lives in
[dashboard.md](dashboard.md); this runbook links to it instead of repeating it.

Roles used here: **the admissions team** (the dashboard's users), **the international
admissions manager** (owns the shared folder and gives access), **the IT/AWS contact** (looks
after the AWS side and the sign-in accounts), and **the repo owner** (reviews and merges code,
and publishes the site).

## 1. Access checklist

You need:

- [ ] **GitHub:** access to the repository, given by the repo owner.
- [ ] **The office's shared folder:** the master copies of the 3 data files and the office's
  handover notes. Access is given by the international admissions manager.
- [ ] **Dashboard sign-in:** an account for the live dashboard, created by the IT/AWS contact.
- [ ] **AWS:** not needed for the monthly routine on the laptop. Updating the *live* dashboard
  goes through the IT/AWS contact (see [section 3](#3-the-laptop-and-the-live-site-are-separate)
  and [section 10](#10-aws-access-recovery-and-mfa-hygiene)).

Never put passwords, keys or recovery codes in the repo, in chat or in a shared document.

## 2. One-time laptop setup

1. Install Node with nvm, then in the repo folder run `npm ci`.
2. Install the intake tool's Python packages:
   `python3 -m pip install -r scripts/intake/requirements.txt`.
3. Copy the 3 data files from the office's shared folder into the repo's `dashboard/` folder:
   `post_F1_J1_By_Post.csv`, `dashboard_by_nationality_F1_J1_2017_2026_clean.xlsx` and
   `dashboard_historical_by_nationality_F1_J1_1997_2026_YTD_clean.xlsx`. Nothing else goes in
   that folder (the build reads every `.xlsx`/`.csv` there). `dashboard/` is never committed.
4. Build and check the local data: `npm run dashboard:data`, then `npm run dashboard:verify`.
   It should end with `PASS` and every check passing.
5. To see the dashboard on your laptop with this data, follow "Local development" in
   [dashboard.md](dashboard.md#local-development), run `npm run dev`, open
   `http://localhost:3000/isa-web/` and sign in as usual.

Raw files and PDFs never go in the repo (it's public). The intake tool's backups, staging and
downloads stay in `dashboard-intake/` on the laptop, which git ignores.

## 3. The laptop and the live site are separate

- **Your laptop:** the monthly update changes the 3 files in `dashboard/` and the local copy
  of the dashboard. That's all it changes.
- **The live dashboard** reads its data from AWS. It changes only when the 3 files are
  uploaded to AWS and the `rebuild-dashboard` Lambda is run (done by the IT/AWS contact; the
  live-upload switch in the intake tool is off).
- **Site code** goes live only through a pull request that the repo owner merges into `main`,
  followed by `npm run deploy` from `main` (by the repo owner). Nothing goes live on push.

**Where things stand (November 2026):** AWS access is locked (see
[section 10](#10-aws-access-recovery-and-mfa-hygiene)), so the live site still runs the
late-October version with the old Lambda. Until the Lambda is updated, Markets on the live site
shows the banner "Monthly nationality data isn't in this data snapshot, so Markets counts visas
by the country where they were issued." Monthly updates made on the laptop change only the
laptop until AWS access is restored. Keep doing them, and keep the shared folder's master
copies current, so the live site can catch up in one step.

## 4. Monthly data update

Do this once a month. The tool's own instructions and checks are in
[Monthly intake](dashboard.md#monthly-intake-pdfs--the-3-data-files); if anything stops or
looks wrong, see [If something goes wrong](dashboard.md#if-something-goes-wrong).

**a) Check whether a new month is out.** Open the State Department's monthly nonimmigrant visa
page in your browser: travel.state.gov → Visa Statistics → Nonimmigrant Visa Statistics →
Monthly Nonimmigrant Visa Issuances. (It blocks scripts, so this step is always by hand.) Look for the month after the
dashboard's "Data through" month. As of November 2026 nothing after February 2026 has been
published. **If nothing is new, write down the date you checked and stop.**

**b) Download both PDFs** for the new month: "NIV Issuances by Nationality and Visa Class" and
"NIV Issuances by Post and Visa Class". Save them from the page, or run
`npm run intake -- --download YYYY-MM` (for example `2026-03`). If several months are out,
download every one; they must be added in order.

**c) Add them.** Run `npm run admin` and open the address it prints (it works only on your
laptop). Drop both PDFs, press **Check the PDFs**, and read the report: the rows added, the F1
and J1 totals, the top 5 nationalities, and any spelling it changed. A yellow **Big change**
warning means the month is more than 50% above or below the same month a year earlier; that
can be real, so just confirm these are the right month's PDFs. Then press **Apply**. The tool
backs up the old files, replaces them, and runs `dashboard:data` and `dashboard:verify`. If
either fails, it puts the old files back by itself and says so.

**d) Confirm and spot-check the newest month only.**

1. The Apply result says the checks passed (`dashboard:verify` passed).
2. On the Markets tab (`npm run dev`), the **Data through** card shows the new month.
3. **India, F1, by nationality:** on Markets, set Visa to F1 and Period to Custom months with
   the new month as both start and end. India's "Nationals" figure must equal the line
   "India F1 …" in the Nationality PDF. (February 2026: 657.)
4. **Mumbai, F1, by post:** on Consulates, keep that Period, choose India and "This country".
   Mumbai's figure must equal the line "Mumbai F1 …" in the Post PDF. (February 2026: 200.)

If a number doesn't match, press **Undo last update** and ask the repo owner.

**e) Update the master copies.** Copy the 3 updated files from `dashboard/` back to the
office's shared folder, replacing the old ones, so the masters never fall behind the laptop.
Then send them to the IT/AWS contact for the live site, once AWS access is back.

## 5. Monthly checks: travel bans, visa pauses and events

Once a month, after the update:

- **Travel bans and visa pauses:** open `app/lib/dashboard/restrictions.ts`. Each restriction
  links its official State Department source (the presidential proclamations and the
  "Temporary Pause of Visa Operations" notice). Open each source in your browser and check
  whether any country was added, removed or changed level, or a pause lifted. Update the
  entries if needed and set `LAST_CHECKED` to today's date.
- **Events:** open `app/lib/dashboard/events.ts` and do the same for any event whose source may
  have changed, then set `EVENTS_LAST_CHECKED`. New events need an official or academic
  source, and are worded as "may have affected", never "caused".
- Run `npm run dashboard:verify`. A change to the restriction list changes some expected
  counts in verify; those have to be updated deliberately (recount the new figure, then edit
  the check), so ask the repo owner if you're unsure. Then open a pull request
  ([section 8](#8-making-a-code-change)).

Even if nothing changed, update the two "last checked" dates so the pages show they were
checked.

## 6. Yearly: the official annual figures

The latest complete fiscal year (FY2025 now) is **provisional**: it's summed from the monthly
reports. When the State Department publishes the official annual tables for that year
(travel.state.gov → Visa Statistics → Annual Reports, the *Report of the Visa Office*), the
historical file should switch to them:

1. This is a manual step today; do it together with the repo owner.
2. Back up the historical file (copy it into `dashboard-intake/backups/`).
3. Replace that fiscal year's rows with the official F1 and J1 figures by nationality, in the
   same columns, with `period_status` "Complete fiscal year" and `data_source` "Annual
   nationality issuance workbook". The build prefers official figures over monthly sums.
4. Run `npm run dashboard:data` and `npm run dashboard:verify`. The year should no longer be
   marked provisional. Some verify checks use that year's figures and will need updating
   deliberately, with each new number recounted first.
5. Update the master copy in the shared folder.

## 7. Adding or fixing things

Each of these is a small code change: make it on a branch, run the checks, and open a pull
request ([section 8](#8-making-a-code-change)).

- **A country's other name in the data** (a nationality spelled differently in a new file):
  for the intake tool, add the PDF spelling to `scripts/intake/pdf_spellings.py` with the
  evidence. For the dashboard's own joining of names, `NATIONALITY_ALIASES` is in the
  `rebuild-dashboard` Lambda, which is an AWS change too (ask the IT/AWS contact).
- **A renamed consulate:** `npm run dashboard:verify` warns "Possible renamed consulate". If it
  is a rename, add it to `POST_ALIASES` in the Lambda (again an AWS change); if not, add the
  pair to verify's allow-list.
- **A region:** `REGION_MAP` in `app/lib/dashboard/constants.ts`. Keep the existing
  assignments; new countries follow the UN geoscheme mapped onto the dashboard's regions.
- **An event:** `app/lib/dashboard/events.ts` (official source, "may have affected").
- **A Bobcat question, definition or navigation answer:** follow
  [How to extend the Bobcat](dashboard.md#how-to-extend-the-bobcat). If you change a
  navigation answer or a definition, update the same sentence in the
  [user guide](USER_GUIDE.md): verify checks they match word for word.

## 8. Making a code change

1. Create a branch; never commit to or push `main` directly.
2. Make the change. Any new number gets recounted independently (with pandas, from the raw
   files) before it goes into verify.
3. Run `npm run dashboard:verify`, `npx tsc --noEmit`, `npx eslint` and `npm run build`; for
   intake changes also `npm run intake:test`.
4. Push the branch and open a pull request. The repo owner reviews it, merges it into `main`,
   and runs `npm run deploy` from an up-to-date `main` to publish the site.
5. Lambda changes also need the IT/AWS contact to upload the Lambda; the
   [handoff notes](dashboard.md#handoff-notes-for-deployment-itaws-contact) list what's pending.

## 9. Rules

- The repo is **public**: never commit secrets, keys, passwords, account IDs, internal links,
  student data, Slate data, raw data files or the PDFs.
- Don't touch the transcript and calculator tools, the sign-in code (`auth.ts`) or `api.ts`.
- Never push to `main` directly: open a pull request.
- Never edit the 3 data files by hand; use the intake tool, so every change is checked and
  backed up.
- Backups in `dashboard-intake/backups/` are never deleted.

## 10. AWS access: recovery and MFA hygiene

**Now:** the AWS account behind the live dashboard is locked because its multi-factor
authentication (MFA) device was lost. Until access is back, the live data and the Lambda can't
be updated. There are two ways back:

1. The account owner completes AWS's identity-verification process for a lost MFA device
   (for the root user this involves notarised identity documents and can take a while), or
2. IT provides a QU-managed AWS account and the dashboard's resources are set up there.

**From then on:**

- The account is owned by an office or IT role, not by a student.
- At least two MFA devices are registered, held by different people in the office or IT.
- The recovery details (root email, phone, contacts) are kept by the office, not by one person.
- Each person signs in with their own access, never a shared password.
- Leavers' access is removed on their last day.

## 11. Known limitations

- The data is **U.S.-wide visa issuances**, not Quinnipiac's applicants or enrolments.
- The latest fiscal year is summed from monthly reports until the official figures arrive.
- Nationality ("who received the visa") and issued-in ("where it was issued") figures differ by
  design.
- Monthly reports leave a country out in a month with no visas; the dashboard counts that as
  zero and can't tell "no visas" from "not reported".
- The live site lags the laptop until AWS access is restored and the Lambda is updated.
- The Bobcat reads questions with word lists, so it can miss unusual phrasings; it then says
  "I don't know" rather than guess.
- New-month checks are by hand: the State Department page blocks scripts.

## 12. Backlog (in priority order)

1. **Restore AWS access**, then deploy the updated `rebuild-dashboard` Lambda (including the
   consulate aliases), merge the branch through a pull request, and `npm run deploy`. See the
   [handoff notes](dashboard.md#handoff-notes-for-deployment-itaws-contact).
2. **Trip planner tab:** one page per country combining restriction status, last-12-months
   trend, country vs world, outreach window and top consulate cities, with a printable
   one-page brief (after AWS is restored).
3. **Switch on the live upload** in the intake tool (`scripts/intake/live_upload.py`), set up
   with the IT/AWS contact.
4. **Move the storage bucket name out of the code** into an environment variable, in both
   dashboard Lambdas (`rebuild-dashboard` and `get-dashboard`).
5. **An automatic "is a new month out?" check** (the State Department page blocks scripts, so
   this needs another approach, such as a reminder plus `--download` probing).
6. **The official Bobcat logo file from Marketing:** save it as
   `public/brand/bobcat-official.png` (same file name) to replace the current image.
7. **Replace the four Wikipedia event sources** (9/11, the 2008 financial crisis, Executive
   Order 13769, the Kyiv embassy) with official or academic sources.
8. **Add the Khartoum embassy suspension (April 2023)** as an event for Sudan, once there's a
   verified source.
9. **Thousands separators in large percentages** (for example "▲ 1,234.5%").
10. **Events on the Consulates tab's yearly views** (they show in the monthly view only).
11. **Monthly coverage states** ("no visas" vs "not reported" vs "consulate closed") instead
    of counting missing months as zero.
12. **Small polish:** the "2020 disruption" label sits close to the 2020 event marker on
    Country 360's yearly charts; check Country 360's long-term chart axis on phones.
13. **Slate counts:** not started; see the office's handover note in the shared folder.
