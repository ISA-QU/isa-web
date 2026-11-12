/**
 * Decodes a dashboard snapshot into plain row arrays. Pure (no fetch, no
 * sign-in), so the dashboard, the Bobcat's tools, the verify script and the
 * terminal runner all decode a snapshot the same way. data.ts fetches the
 * snapshot and re-exports these.
 *
 * The snapshot's tables are dictionary-encoded columnar JSON; ~55k rows decode
 * to a few MB of objects, cheap enough to hold in memory so every tab filters
 * with ordinary array operations instead of precomputed slices.
 */

import { COUNTRY_COORDS } from "./constants";
import type {
  AnnualCountryRow,
  DashboardData,
  NationalityMonthlyRow,
  OperationalRow,
  PostMonthlyRow,
  SnapshotMeta,
  Visa,
} from "./types";

const VISA_BY_CODE: Visa[] = ["F1", "J1"];
export const SCHEMA = "dashboard-snapshot@1";

interface ColumnarTable {
  rowCount: number;
  dims: Record<string, string[]>;
  cols: Record<string, number[]>;
}

/** The snapshot as served. `nationalityMonthly` is optional: older snapshots lack it. */
export interface Snapshot extends SnapshotMeta {
  schema: string;
  postsMonthly: ColumnarTable;
  annualCountry: ColumnarTable;
  nationalityMonthly?: ColumnarTable;
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
 * The monthly nationality table, or null when it is missing or not shaped as
 * expected, so a snapshot without it (or with a bad one) never breaks the
 * dashboard.
 */
function decodeNationalityMonthly(table: ColumnarTable | undefined): NationalityMonthlyRow[] | null {
  if (!table || typeof table.rowCount !== "number" || !table.dims || !table.cols) return null;
  const country = table.dims.country;
  const { year, month, visa, issuances } = table.cols;
  const countryIds = table.cols.country;
  const columns = [year, month, countryIds, visa, issuances];
  if (!Array.isArray(country) || columns.some((col) => !Array.isArray(col) || col.length !== table.rowCount)) {
    return null;
  }
  const nonCountry = new Set(Array.isArray(table.dims.nonCountry) ? table.dims.nonCountry : []);
  const rows: NationalityMonthlyRow[] = new Array(table.rowCount);
  for (let i = 0; i < table.rowCount; i += 1) {
    const name = country[countryIds[i]];
    rows[i] = {
      year: year[i],
      month: month[i],
      fiscalYear: month[i] >= 10 ? year[i] + 1 : year[i],
      monthIndex: year[i] * 12 + (month[i] - 1),
      country: name,
      visa: VISA_BY_CODE[visa[i]],
      issuances: issuances[i],
      isCountry: !nonCountry.has(name),
    };
  }
  return rows;
}

/**
 * Decodes a fetched snapshot into the rows the tabs use. The operational layer
 * is not shipped separately: it is the tail of the post data from
 * `coverage.operational.start`.
 */
export function decodeSnapshot(snapshot: Snapshot): DashboardData {
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
    nationalityMonthly: decodeNationalityMonthly(snapshot.nationalityMonthly),
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
