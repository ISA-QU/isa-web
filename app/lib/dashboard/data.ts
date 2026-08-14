/**
 * Loads the dashboard's JSON tables and decodes them into plain row arrays.
 *
 * The payload is dictionary-encoded columnar JSON (see
 * scripts/build-dashboard-data.mjs). Roughly 64k rows total decode to a few MB
 * of objects, which is cheap enough to hold in memory and lets every tab filter
 * with ordinary array operations instead of precomputed slices.
 */

import { DASHBOARD_DATA_BASE_URL } from "../awsConfig";
import type {
  AnnualCountryRow,
  Coord,
  CountryMetricRow,
  DashboardData,
  OperationalRow,
  PostMonthlyRow,
  Visa,
} from "./types";

const VISA_BY_CODE: Visa[] = ["F1", "J1"];

interface ColumnarTable {
  schema: string;
  rowCount: number;
  dims: Record<string, string[]>;
  cols: Record<string, number[]>;
}

async function fetchJson<T>(file: string): Promise<T> {
  const url = `${DASHBOARD_DATA_BASE_URL}/${file}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch (cause) {
    throw new Error(
      `Could not reach the dashboard data at ${url}. ` +
        `Check NEXT_PUBLIC_DASHBOARD_DATA_URL and the bucket's CORS rules.`,
      { cause },
    );
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} while loading ${url}`);
  }
  return (await response.json()) as T;
}

function decodeOperational(table: ColumnarTable): OperationalRow[] {
  const { post, country } = table.dims;
  const { cols } = table;
  const rows: OperationalRow[] = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    rows[i] = {
      post: post[cols.post[i]],
      country: country[cols.country[i]],
      visa: VISA_BY_CODE[cols.visa[i]],
      year: cols.year[i],
      month: cols.month[i],
      issuances: cols.issuances[i],
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

function decodePostsMonthly(table: ColumnarTable): PostMonthlyRow[] {
  const { post, postRaw, country, sourceFormat, sourceFile } = table.dims;
  const { cols } = table;
  const rows: PostMonthlyRow[] = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    const year = cols.year[i];
    const month = cols.month[i];
    rows[i] = {
      year,
      month,
      fiscalYear: cols.fiscalYear[i],
      post: post[cols.post[i]],
      postRaw: postRaw[cols.postRaw[i]],
      country: country[cols.country[i]],
      visa: VISA_BY_CODE[cols.visa[i]],
      issuances: cols.issuances[i],
      sourceFormat: sourceFormat[cols.sourceFormat[i]],
      sourceFile: sourceFile[cols.sourceFile[i]],
      monthIndex: year * 12 + (month - 1),
    };
  }
  return rows;
}

/**
 * Fetches everything the dashboard needs.
 *
 * The consulate layer is allowed to fail without taking the page down, matching
 * app.py's try/except around `get_historical_consulate_data()` — tabs that need
 * it show an error, the rest keep working.
 */
export async function loadDashboardData(): Promise<DashboardData> {
  const [operationalTable, annualTable, metricsTable, referenceTable] = await Promise.all([
    fetchJson<ColumnarTable>("operational.json"),
    fetchJson<ColumnarTable>("annual-country.json"),
    fetchJson<{ items: CountryMetricRow[] }>("country-metrics.json"),
    fetchJson<{ countryCoords: Record<string, Coord> }>("reference.json"),
  ]);

  let postsMonthly: PostMonthlyRow[] = [];
  let consulateError: string | null = null;
  try {
    postsMonthly = decodePostsMonthly(await fetchJson<ColumnarTable>("posts-monthly.json"));
  } catch (error) {
    consulateError = error instanceof Error ? error.message : String(error);
  }

  return {
    operational: decodeOperational(operationalTable),
    annualCountry: decodeAnnualCountry(annualTable),
    postsMonthly,
    countryMetrics: metricsTable.items,
    countryCoords: referenceTable.countryCoords,
    consulateError,
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
