import { BASE_PATH } from "./basePath";

export const API_BASE_URL =
  "https://8scq4w84j2.execute-api.us-east-1.amazonaws.com/prod";

/**
 * Where the recruitment dashboard reads its JSON from.
 *
 * Built by `node scripts/build-dashboard-data.mjs` and uploaded to S3 — the
 * source CSVs and the generated JSON are both gitignored. Set
 * NEXT_PUBLIC_DASHBOARD_DATA_URL to the S3/CloudFront origin at build time;
 * without it we fall back to `public/dashboard-data/`, which `npm run
 * dashboard:data` populates for local development.
 */
export const DASHBOARD_DATA_BASE_URL = (
  process.env.NEXT_PUBLIC_DASHBOARD_DATA_URL || `${BASE_PATH}/dashboard-data`
).replace(/\/$/, "");
