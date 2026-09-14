/**
 * Loads the dashboard snapshot and decodes it into plain row arrays.
 *
 * The snapshot is built by the rebuild-dashboard Lambda from the raw workbooks
 * in S3 and served by the get-dashboard Lambda. Its tables are
 * dictionary-encoded columnar JSON; ~55k rows decode to a few MB of objects,
 * cheap enough to hold in memory so every tab filters with ordinary array
 * operations instead of precomputed slices.
 */

import { authHeaders, redirectToLogin } from "../auth";
import { DASHBOARD_DATA_URL } from "../awsConfig";
import { COUNTRY_COORDS } from "./constants";
import type {
  AnnualCountryRow,
  DashboardData,
  OperationalRow,
  PostMonthlyRow,
  SnapshotMeta,
  Visa,
} from "./types";

const VISA_BY_CODE: Visa[] = ["F1", "J1"];
const SCHEMA = "dashboard-snapshot@1";

interface ColumnarTable {
  rowCount: number;
  dims: Record<string, string[]>;
  cols: Record<string, number[]>;
}

interface Snapshot extends SnapshotMeta {
  schema: string;
  postsMonthly: ColumnarTable;
  annualCountry: ColumnarTable;
}

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

function decodePostsMonthly(table: ColumnarTable): PostMonthlyRow[] {
  const { post, country } = table.dims;
  const { cols } = table;
  const rows: PostMonthlyRow[] = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    const year = cols.year[i];
    const month = cols.month[i];
    rows[i] = {
      year,
      month,
      fiscalYear: month >= 10 ? year + 1 : year,
      post: post[cols.post[i]],
      country: country[cols.country[i]],
      visa: VISA_BY_CODE[cols.visa[i]],
      issuances: cols.issuances[i],
      monthIndex: year * 12 + (month - 1),
    };
  }
  return rows;
}

function decodeAnnualCountry(table: ColumnarTable): AnnualCountryRow[] {
  const { country } = table.dims;
  const { cols } = table;
  const rows: AnnualCountryRow[] = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    rows[i] = {
      fiscalYear: cols.fiscalYear[i],
      country: country[cols.country[i]],
      visa: VISA_BY_CODE[cols.visa[i]],
      issuances: cols.issuances[i],
    };
  }
  return rows;
}

/**
 * Fetches and decodes the snapshot. The operational layer is not shipped
 * separately: it is the tail of the post data from `coverage.operational.start`.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  const snapshot = await fetchSnapshot();
  const postsMonthly = decodePostsMonthly(snapshot.postsMonthly);

  const operationalStart = snapshot.coverage.operational.start;
  const operational: OperationalRow[] = [];
  for (const row of postsMonthly) {
    if (row.monthIndex < operationalStart) continue;
    operational.push({
      post: row.post,
      country: row.country,
      visa: row.visa,
      year: row.year,
      month: row.month,
      issuances: row.issuances,
    });
  }

  return {
    operational,
    postsMonthly,
    annualCountry: decodeAnnualCountry(snapshot.annualCountry),
    countryCoords: COUNTRY_COORDS,
    meta: {
      generatedAt: snapshot.generatedAt,
      coverage: snapshot.coverage,
      fiscalYears: snapshot.fiscalYears,
      validation: snapshot.validation,
      sources: snapshot.sources,
      warnings: snapshot.warnings,
    },
  };
}

/** Splits the operational layer the way `get_f1_j1()` does. */
export function splitVisa(rows: readonly OperationalRow[]): {
  f1: OperationalRow[];
  j1: OperationalRow[];
} {
  return {
    f1: rows.filter((r) => r.visa === "F1"),
    j1: rows.filter((r) => r.visa === "J1"),
  };
}
