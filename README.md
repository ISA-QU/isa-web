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

The dashboard's data comes from three Excel workbooks kept in S3, never in git. The
`rebuild-dashboard` Lambda merges them into one snapshot and `get-dashboard` serves it at
`GET /dashboard`. The site calls that by default, so `npm run deploy` needs no settings.

To work on the dashboard locally, put the workbooks in `dashboard/` and build the snapshot:

```bash
npm run dashboard:data     # build public/dashboard-data/snapshot.json from dashboard/*.xlsx
npm run dashboard:verify   # check it against the figures the original project validated
```

Then point `npm run dev` at it with a `.env.development.local` file containing
`NEXT_PUBLIC_DASHBOARD_DATA_URL=/isa-web/dashboard-data/snapshot.json`.

See [docs/dashboard.md](docs/dashboard.md) for the AWS setup, the monthly update routine,
and notes on the port.

claude --resume a34323c4-eccb-4620-8c02-d39270f34e43