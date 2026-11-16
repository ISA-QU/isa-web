/**
 * Loads the dashboard snapshot and decodes it into plain row arrays.
 *
 * The snapshot is built by the rebuild-dashboard Lambda from the raw workbooks
 * in S3 and served by the get-dashboard Lambda. Decoding lives in decode.ts
 * (pure, shared with the Bobcat's tools and the verify script).
 */

import { authHeaders, redirectToLogin } from "../auth";
import { DASHBOARD_DATA_URL } from "../awsConfig";
import { SCHEMA, decodeSnapshot, type Snapshot } from "./decode";
import type { DashboardData } from "./types";

export { decodeSnapshot, splitVisa, type Snapshot } from "./decode";

async function fetchSnapshot(): Promise<Snapshot> {
  const headers = await authHeaders();
  let response: Response;
  try {
    response = await fetch(DASHBOARD_DATA_URL, { headers });
  } catch (cause) {
    throw new Error(
      `Could not reach the dashboard data at ${DASHBOARD_DATA_URL}. ` +
        `Check that the GET /dashboard route exists and allows this site in its CORS settings.`,
      { cause },
    );
  }
  if (response.status === 401) {
    redirectToLogin();
    throw new Error("Your session has expired. Sign in again.");
  }
  if (response.status === 404) {
    throw new Error(
      "No dashboard snapshot has been built yet. Upload the raw files to S3 and run the " +
        "rebuild-dashboard Lambda.",
    );
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while loading ${DASHBOARD_DATA_URL}`);
  }
  const snapshot = (await response.json()) as Snapshot;
  if (snapshot.schema !== SCHEMA) {
    throw new Error(`Unsupported dashboard snapshot schema "${snapshot.schema}", expected "${SCHEMA}".`);
  }
  return snapshot;
}

/** Fetches the snapshot and decodes it. */
export async function loadDashboardData(): Promise<DashboardData> {
  return decodeSnapshot(await fetchSnapshot());
}
