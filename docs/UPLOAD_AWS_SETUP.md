# Switching on the Update data tab on the live site (AWS)

**For the IT/AWS contact.** The dashboard's **Update data** tab adds a new month from the State
Department's two monthly PDFs. On the office laptop it already works (`npm run dev:admin`). On
the live site it says "Not connected yet" until the steps below are done. **Nothing here has
been set up or deployed yet.**

When it's on, an admin drops the month's two PDFs on the live site, checks the report, and
presses Apply. The new function `intake-upload` runs the same intake tool as the laptop, writes
the 3 data files to the raw-files area, and runs `rebuild-dashboard`. If anything fails, it puts
the old files back by itself. **Undo last update** reverses the most recent update. Backups are
never deleted.

This repo is public, so it holds no account IDs, storage names, addresses or keys. Where a step
needs one, it's written `<LIKE_THIS>`; you'll find it in the AWS console.

## Before you start

- AWS console access to the account that runs the dashboard (the one with `rebuild-dashboard`
  and `get-dashboard`).
- A computer with this repo, Python 3 and internet access, to build the function's zip.
- **The live `rebuild-dashboard` must be the current version** from `main`
  (`backend/lambdas/rebuild-dashboard/lambda_function.py`). The zip carries a copy of the same
  file for its name lists and reader, so the two must match. Whenever `rebuild-dashboard`
  changes, build and upload the zip again too (step 2 and step 3.2).
- About an hour.

Values you'll need: `<REGION>` (the dashboard's region), `<ACCOUNT_ID>`, `<BUCKET>` and the
raw-files folder (the `BUCKET` and `RAW_PREFIX` lines at the top of
`backend/lambdas/rebuild-dashboard/lambda_function.py`), the Cognito **User pool**, and the HTTP
API the website already calls (the address in `app/lib/awsConfig.ts`).

## 1. Make sure the raw-files area holds exactly the 3 files

The rebuild reads **every** `.xlsx` and `.csv` in the raw-files area, and so does the new
function. The office laptop's `dashboard/` folder holds the current 3 files:

- `post_F1_J1_By_Post.csv`
- `dashboard_by_nationality_F1_J1_2017_2026_clean.xlsx`
- `dashboard_historical_by_nationality_F1_J1_1997_2026_YTD_clean.xlsx`

Earlier setups put older workbooks there under other names, so check now:

1. **S3 → `<BUCKET>` → the raw-files folder.** List what's there.
2. If there's **any** other `.xlsx` or `.csv` (for example an older `dashboard_by_post_…xlsx`),
   tell the admissions team, then move it out of the raw-files folder (for example into an
   `archive/` folder in the same bucket). Move it, don't delete it.
3. Upload the 3 files from the office laptop (after `npm run dashboard:verify` passes there),
   replacing any older copies with the same names. Bucket versioning keeps the previous versions.
4. Run `rebuild-dashboard`'s **Test** with `{}`. Expect `"ok": true` and `"warnings": []`, and
   the coverage the laptop shows (the `dashboard:data` output there lists the same lines).
5. The folder now holds exactly those 3 files. The function stops with a clear message if that
   ever changes ("The raw-files area has other .xlsx/.csv files…").

## 2. Build the function's zip

On the computer with the repo, from the repo folder:

```
npm run intake:lambda
```

This writes `build/intake-upload.zip` (about 40 MB; `build/` is never committed). It contains:

- the function;
- the intake tool's code;
- `rebuild-dashboard`'s code;
- the Linux builds of the PDF and Excel packages for Python 3.12 on x86_64.

For an arm64 function instead, run `python3 scripts/intake/build_lambda.py --platform manylinux2014_aarch64`.

## 3. Create the function

1. **Lambda → Create function.** Name `intake-upload`, runtime **Python 3.12**, architecture
   **x86_64** (to match the zip).
2. **Code → Upload from → .zip file** → `build/intake-upload.zip`. **Runtime settings → Edit →**
   Handler `lambda_function.lambda_handler`.
3. **Configuration → General configuration → Edit:** memory **2048 MB** (reading the PDFs and
   writing the workbooks is the slow part; more memory is also more speed), timeout
   **5 min**. A check takes about a minute.
4. **Configuration → Asynchronous invocation → Edit:** **Retry attempts 0.** Each job runs in
   the background, and a failed job must not be run again by itself. (The function also refuses
   to run a job twice.)
5. **Configuration → Environment variables → Edit:**

   | Key | Value |
   |---|---|
   | `DATA_BUCKET` | `<BUCKET>` (exactly the `BUCKET` in `rebuild-dashboard`) |
   | `RAW_PREFIX` | the raw-files folder (exactly the `RAW_PREFIX` in `rebuild-dashboard`, e.g. `raw/`) |
   | `WORK_PREFIX` | `intake/` (the function's own folder: uploads, staging, backups, jobs; must be outside the raw-files folder) |
   | `REBUILD_FUNCTION` | `rebuild-dashboard` |
   | `ADMIN_GROUP` | `dashboard-admins` |
   | `MAX_PDF_MB` | `20` (optional; the largest PDF accepted) |

   The function checks that `DATA_BUCKET` and `RAW_PREFIX` are where `rebuild-dashboard` reads,
   and stops if not.

## 4. Permissions

**Configuration → Permissions →** open the role → **Add permissions → Create inline policy →
JSON** (replace the `<…>`; `raw/` and `intake/` are the two folders from step 3.5):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": "s3:ListBucket", "Resource": "arn:aws:s3:::<BUCKET>",
      "Condition": { "StringLike": { "s3:prefix": ["raw/*", "intake/*"] } } },
    { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": ["arn:aws:s3:::<BUCKET>/raw/*", "arn:aws:s3:::<BUCKET>/intake/*"] },
    { "Effect": "Allow", "Action": "s3:DeleteObject", "Resource": "arn:aws:s3:::<BUCKET>/intake/lock.json" },
    { "Effect": "Allow", "Action": "lambda:InvokeFunction", "Resource": [
      "arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:rebuild-dashboard",
      "arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:intake-upload" ] }
  ]
}
```

- **Storage:** the function reads and writes the raw files and its own folder. It can't read
  or change the snapshot, or anything else in the bucket.
- **Deleting:** the only thing it can delete is its lock note (`intake/lock.json`, which keeps
  two updates from running at once). It can't delete backups.
- **Lambda:** it can run `rebuild-dashboard`, and run itself for the background jobs.

The role also keeps the standard `AWSLambdaBasicExecutionRole` for its log.

## 5. Let the browser upload the PDFs

The browser sends the PDFs straight to storage through one-time upload links (each valid for 10
minutes, PDFs only, up to `MAX_PDF_MB`), so the bucket must accept uploads from the live site.

**S3 → `<BUCKET>` → Permissions → Cross-origin resource sharing (CORS) → Edit.** If it's empty,
paste the following. If it already has rules, add this one to them:

```json
[
  {
    "AllowedOrigins": ["<LIVE SITE ORIGIN>"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

`<LIVE SITE ORIGIN>` is the site's address without a path: the `https://…` entry in
`backend/awsConfig.js` under `cors.allowedOrigins`. Keep **Block all public access** on: upload
links work without it.

## 6. The admin group

Only members of this group can use the tab's buttons. Everyone else sees "Only dashboard admins
can update the data."

1. **Cognito → User pools →** the dashboard's pool **→ Groups → Create group.** Name
   `dashboard-admins` (the same as `ADMIN_GROUP`).
2. **Add users to group:** the international admissions manager and whoever else the
   admissions team chooses.
3. A person's group is in their sign-in token only after they **sign out and sign in again**.

## 7. The API routes

On the HTTP API the website already calls (the address in `app/lib/awsConfig.ts`):

1. **Routes → Create** these three, each with **Attach integration → Lambda → `intake-upload`**
   (payload format version 2.0):
   - `POST /intake/uploads`
   - `POST /intake/jobs`
   - `GET /intake/jobs/{jobId}`
2. **Authorization:** attach the existing `cognito` JWT authorizer to all three, as on every
   other route (see [docs/login.md](login.md), "Lock the API"). The function also checks the
   admin group itself.
3. **CORS:** the existing settings should already allow `GET` and `POST` from the live site with
   the `authorization` and `content-type` headers. If `POST` isn't allowed, add it.
4. If the stage doesn't auto-deploy: **Deploy** to it.
5. Check it: opening `<API ADDRESS>/intake/jobs/x` in a browser must answer
   `{"message":"Unauthorized"}`.

`<API ADDRESS>` is the address in `app/lib/awsConfig.ts`, including its stage (it ends in `/prod`).

## 8. Switch the tab to aws mode (the repo owner)

The site chooses the tab's connection when it's built. A normal deploy is always **off**. To
build it in aws mode, the deploy command itself must say so (never put these settings in a
`.env` file; the deploy check refuses that):

```
NEXT_PUBLIC_UPLOAD_MODE=aws NEXT_PUBLIC_UPLOAD_API_URL=<API ADDRESS> npm run deploy
```

- If the admin group isn't called `dashboard-admins`, also set
  `NEXT_PUBLIC_UPLOAD_ADMIN_GROUP=<group>`.
- The deploy check (`npm run check:upload-off`, run by `npm run deploy`) prints "the Update data
  tab is in aws mode, as this deploy asked", and ends with **"Upload tab: AWS — connected to the
  configured endpoint"**. If it ends with "Upload tab: OFF — Not connected yet", the settings
  weren't included: deploy again with them.
- It still stops the deploy if any laptop setting, this computer's address or another AWS
  address is in the built site.
- **Every later deploy needs the same settings, or the tab goes back to "Not connected yet".**
  That's the safe default. Nothing breaks; updates just go back to the laptop.

## 9. First test: February 2026 must be refused

Do this right after step 8, before anyone uses the tab:

1. Sign in on the live site as a member of `dashboard-admins` (sign out and in again first, so
   the group is in the token). Open **Update data**.
2. Drop **February 2026's** two PDFs ("NIV Issuances by Nationality and Visa Class" and "NIV
   Issuances by Post and Visa Class"). **Don't** tick "Replace a month that's already in the
   files". Press **Check the PDFs**, and wait about a minute.
3. It must stop with: **"2026-02 is already in the files. Tick "Replace a month that's already
   in the files" above and check again."** That proves, with nothing changed, that:
   - the upload links work;
   - the function runs and reads the PDFs with its packages;
   - it reads the raw files.
4. Sign in as someone who **isn't** in the group: the tab must say "Only dashboard admins can
   update the data", and its buttons must be disabled.

If step 3 shows anything else, see [If something goes wrong](#if-something-goes-wrong), and
don't use the tab until it's fixed. The first real update is the next new month, following
[the runbook's section 4](RUNBOOK.md#4-monthly-data-update) on the live site instead of the laptop.

## How it works

- **The flow:**
  1. **Check** uploads the PDFs to `intake/uploads/<job>/`.
  2. The function runs the intake tool on a temporary copy of the 3 raw files, and saves the
     checked files in `intake/staging/<job>/`.
  3. **Apply** saves a backup of the current 3 files in `intake/backups/<date-time>/` (with
     `backup.json`, which says why it was made).
  4. It then writes the checked files to the raw-files area and runs `rebuild-dashboard`.
- **If the rebuild fails or warns,** the function puts the backup back and runs
  `rebuild-dashboard` again, then says "Apply failed, old files restored, nothing changed."
- **Apply refuses to run** if the raw files changed since the check, or if the same check was
  already applied.
- **Undo** restores the most recent update's backup, after saving the current files as another
  backup, then rebuilds. It refuses if the files changed since that update.
- **Jobs:** the API stops waiting after about 29 seconds, so each action is a job that runs in
  the background. Each job's status is in `intake/jobs/<job>.json`, and the tab checks it every
  3 seconds.
- **One at a time:** only one Apply or Undo can run at once (`intake/lock.json`). A lock left
  over from a run that was cut off clears itself after 20 minutes.
- **Times** in backup and job names are UTC.
- **Nothing in `intake/` is ever deleted** by the function, except the lock note.
- **Compared with the laptop:** the laptop also runs `dashboard:verify`, the dashboard's full
  list of checks. In AWS the checks are:
  - the intake tool's own rules;
  - reading the staged files back with `rebuild-dashboard`'s reader;
  - `rebuild-dashboard` itself, with no warnings allowed.

  After a live update, the repo owner can still run `dashboard:verify` on the laptop with the
  same 3 files.

**To put back any earlier state by hand:** copy the 3 files from a folder in `intake/backups/`
into the raw-files area, then run `rebuild-dashboard`'s Test with `{}`.

## If something goes wrong

- **"The upload function isn't set up yet"** or **"…must be where rebuild-dashboard reads the
  raw files":** check the environment variables (step 3.5).
- **"The raw-files area has other .xlsx/.csv files…" / "…is missing …":** see step 1.
- **"Uploading … failed":** usually the bucket's CORS rule (step 5), or the upload link expired
  (it lasts 10 minutes; press Check again).
- **"Your sign-in has expired":** sign in again.
- **"Only dashboard admins…" for an admin:** they're not in the group yet, or haven't signed out
  and in since being added (step 6).
- **"Another update or undo is running":** wait a minute. If no one is running one, a lock from
  a run that was cut off clears itself after 20 minutes.
- **"No answer after 8 minutes" or "Something went wrong on the server":** open the function's
  log (**Monitor → View CloudWatch logs**). Common causes are the timeout or memory (step 3.3),
  or permissions (step 4).
- **A name it has never seen:** the same as on the laptop; see
  [If something goes wrong](dashboard.md#if-something-goes-wrong) in the dashboard docs.

## Turning it off again

Deploy normally (`npm run deploy`, with no upload settings): the tab says "Not connected yet",
and updates go back to the laptop. The function, routes and group can stay; nothing calls them.

## Testing without AWS

Run these on the laptop. None of them touch AWS.

- `npm run intake:test` includes the function's tests. They use stand-ins for storage and
  Lambda (`scripts/intake/fake_aws.py`), and cover:
  - admins only;
  - upload links;
  - check, apply, rollback, undo;
  - the lock;
  - a job never running twice.
- `python3 scripts/intake/lambda_proof.py --pdf "<nationality>.pdf" --pdf "<post>.pdf"` runs the
  whole flow on the real 3 files and the real `rebuild-dashboard` code, in
  `dashboard-intake/lambda-proof/`. With February 2026 it checks that:
  1. the check without Replace is refused;
  2. Apply passes, and the snapshot equals today's;
  3. after Undo, the 3 files are byte-identical.
