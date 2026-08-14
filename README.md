## Getting Started

To Make changes from Scratch,

1. npm install (for packages)
2. npm run dev (to see locally)

3. Then git push:
git status (to check)
git add . (add all files)
git commit -m "<>" (replace <> with a comment)
git push

PS: Take permissions if you are pushing from your account.
(Make sure to watch yt if you are not sure)

4. npm run deploy


Link locally: http://localhost:3000/isa-web
deployed at: https://isa-qu.github.io/isa-web/

## Pages

| Route | Page |
|---|---|
| `/` | Recruitment Intelligence dashboard |
| `/dashboard` | The same dashboard |
| `/transcript` | Transcript list |
| `/calculator` | GPA calculator |

## Dashboard data

The dashboard reads pre-built JSON from S3 — no data is committed to git. Before running
locally you need to generate it once:

```bash
npm run dashboard:data     # build the JSON and stage it in public/ for local dev
npm run dashboard:verify   # check the ported metrics against the original Python
```

When deploying, point the app at S3:

```bash
NEXT_PUBLIC_DASHBOARD_DATA_URL=https://<bucket>.s3.amazonaws.com/dashboard-data npm run deploy
```

See [docs/dashboard.md](docs/dashboard.md) for the S3 bucket setup, CORS rules, and notes
on the port.
