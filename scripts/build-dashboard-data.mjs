#!/usr/bin/env node
/**
 * Builds the compact JSON the recruitment dashboard reads at runtime.
 *
 * Source CSVs (the old Streamlit `dashboard/` tree) never enter git. This script
 * rolls them down to their analytic grain and writes dictionary-encoded columnar
 * JSON small enough to hand to the browser, so every filter the Streamlit app
 * offered still composes client-side.
 *
 * Usage:
 *   node scripts/build-dashboard-data.mjs [--src <dir>] [--out <dir>]
 *
 * Defaults: --src dashboard/data  --out dashboard-data
 */

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { src: "dashboard/data", out: "dashboard-data" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--src") args.src = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  return args;
}

/**
 * RFC 4180 CSV parser. The historical country file quotes names containing
 * commas ("Bahamas, The"), so splitting on commas is not safe.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) i = 1; // strip BOM

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Ignore the trailing blank line most CSV writers emit.
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      i += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }
  if (field !== "" || row.length > 0) pushRow();

  const header = rows.shift().map((h) => h.trim().toLowerCase());
  return rows.map((cells) => {
    const record = {};
    for (let c = 0; c < header.length; c += 1) record[header[c]] = cells[c] ?? "";
    return record;
  });
}

async function readCsv(file) {
  return parseCsv(await readFile(file, "utf8"));
}

/** Mirrors pandas `pd.to_numeric(..., errors="coerce")`: bad values become null. */
function num(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "nan") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Dictionary encoder: keeps repeated strings out of the payload. */
class Dim {
  constructor() {
    this.values = [];
    this.index = new Map();
  }
  id(value) {
    let existing = this.index.get(value);
    if (existing === undefined) {
      existing = this.values.length;
      this.values.push(value);
      this.index.set(value, existing);
    }
    return existing;
  }
}

const VISA_CODES = { F1: 0, J1: 1 };

function fail(message) {
  console.error(`\n  build-dashboard-data: ${message}\n`);
  process.exit(1);
}

/**
 * Operational layer — Jan 2023 to Sep 2025, monthly by post.
 *
 * Reproduces `utils/data.py:load_data()` exactly, including the two behaviours
 * that silently shrink the dataset: rows whose post is absent from POST_COUNTRY
 * are dropped, and countries missing from COUNTRY_COORDS get null lat/lon.
 */
function buildOperational(records, reference) {
  const { postCountry, countryCoords } = reference;
  const postDim = new Dim();
  const countryDim = new Dim();
  const cols = { post: [], country: [], visa: [], year: [], month: [], issuances: [] };

  const droppedPosts = new Map();
  let droppedInvalid = 0;

  for (const record of records) {
    const post = String(record.post ?? "").trim();
    const visaClass = String(record.visa_class ?? "").trim().toUpperCase();
    const year = num(record.year);
    const month = num(record.month);
    const date = String(record.date ?? "").trim();

    if (year === null || month === null || date === "" || Number.isNaN(Date.parse(date))) {
      droppedInvalid += 1;
      continue;
    }
    const country = postCountry[post];
    if (!country) {
      droppedPosts.set(post, (droppedPosts.get(post) ?? 0) + 1);
      continue;
    }
    const visa = VISA_CODES[visaClass];
    if (visa === undefined) {
      droppedInvalid += 1;
      continue;
    }

    cols.post.push(postDim.id(post));
    cols.country.push(countryDim.id(country));
    cols.visa.push(visa);
    cols.year.push(year);
    cols.month.push(month);
    cols.issuances.push(num(record.issuances) ?? 0);
  }

  const missingCoords = countryDim.values.filter((c) => !countryCoords[c]);

  return {
    table: {
      schema: "operational@1",
      rowCount: cols.visa.length,
      dims: { post: postDim.values, country: countryDim.values },
      cols,
    },
    stats: {
      sourceRows: records.length,
      keptRows: cols.visa.length,
      droppedInvalid,
      droppedUnmappedPosts: [...droppedPosts.entries()].sort((a, b) => b[1] - a[1]),
      countriesMissingCoords: missingCoords,
    },
  };
}

/** Annual country/nationality history — FY1997 to FY2024. */
function buildAnnualCountry(records) {
  const countryDim = new Dim();
  const cols = { fiscalYear: [], country: [], visa: [], issuances: [] };
  let dropped = 0;

  for (const record of records) {
    const fiscalYear = num(record.fiscal_year);
    const country = String(record.country ?? "").trim();
    const visaClass = String(record.visa_class ?? "").trim().toUpperCase();
    const visa = VISA_CODES[visaClass];
    if (fiscalYear === null || country === "" || visa === undefined) {
      dropped += 1;
      continue;
    }
    cols.fiscalYear.push(fiscalYear);
    cols.country.push(countryDim.id(country));
    cols.visa.push(visa);
    cols.issuances.push(num(record.issuances) ?? 0);
  }

  return {
    table: {
      schema: "annual-country@1",
      rowCount: cols.visa.length,
      dims: { country: countryDim.values },
      cols,
    },
    stats: { sourceRows: records.length, keptRows: cols.visa.length, dropped },
  };
}

/**
 * Monthly consulate history — Mar 2017 to Sep 2025.
 *
 * `get_historical_consulate_data()` in app.py raises rather than silently
 * dropping, so anything unparseable here is a hard build failure.
 */
function buildPostsMonthly(records) {
  const postDim = new Dim();
  const postRawDim = new Dim();
  const countryDim = new Dim();
  const sourceFormatDim = new Dim();
  const sourceFileDim = new Dim();
  const cols = {
    year: [],
    month: [],
    fiscalYear: [],
    post: [],
    postRaw: [],
    country: [],
    visa: [],
    issuances: [],
    sourceFormat: [],
    sourceFile: [],
  };

  for (const [rowIndex, record] of records.entries()) {
    const year = num(record.calendar_year);
    const month = num(record.calendar_month);
    const fiscalYear = num(record.fiscal_year);
    const issuances = num(record.issuances);
    const post = String(record.post_canonical ?? "").trim();
    const postRaw = String(record.post_raw ?? "").trim();
    const country = String(record.country ?? "").trim();
    const visaClass = String(record.visa_class ?? "").trim().toUpperCase();
    const sourceFormat = String(record.source_format ?? "").trim();
    const sourceFile = String(record.source_file ?? "").trim();

    if (year === null || month === null || fiscalYear === null) {
      fail(`consulate history row ${rowIndex + 2} has an invalid period`);
    }
    if (issuances === null) {
      fail(`consulate history row ${rowIndex + 2} has a non-numeric issuances value`);
    }
    if (post === "" || country === "") {
      fail(`consulate history row ${rowIndex + 2} has a blank country or canonical post`);
    }
    if (VISA_CODES[visaClass] === undefined) {
      fail(`consulate history row ${rowIndex + 2} has unsupported visa class "${visaClass}"`);
    }

    cols.year.push(year);
    cols.month.push(month);
    cols.fiscalYear.push(fiscalYear);
    cols.post.push(postDim.id(post));
    cols.postRaw.push(postRawDim.id(postRaw));
    cols.country.push(countryDim.id(country));
    cols.visa.push(VISA_CODES[visaClass]);
    cols.issuances.push(issuances);
    cols.sourceFormat.push(sourceFormatDim.id(sourceFormat));
    cols.sourceFile.push(sourceFileDim.id(sourceFile));
  }

  // app.py sorts by date, country, post, visa_class before handing the frame to
  // the tabs. Preserve that so "first row wins" tie-breaks match the original.
  const order = cols.visa
    .map((_, i) => i)
    .sort((a, b) => {
      const dateDiff = cols.year[a] * 12 + cols.month[a] - (cols.year[b] * 12 + cols.month[b]);
      if (dateDiff !== 0) return dateDiff;
      const countryDiff = countryDim.values[cols.country[a]].localeCompare(
        countryDim.values[cols.country[b]],
      );
      if (countryDiff !== 0) return countryDiff;
      const postDiff = postDim.values[cols.post[a]].localeCompare(postDim.values[cols.post[b]]);
      if (postDiff !== 0) return postDiff;
      return cols.visa[a] - cols.visa[b];
    });

  const sorted = {};
  for (const [key, values] of Object.entries(cols)) sorted[key] = order.map((i) => values[i]);

  const months = new Set(sorted.year.map((y, i) => `${y}-${sorted.month[i]}`));

  return {
    table: {
      schema: "posts-monthly@1",
      rowCount: sorted.visa.length,
      dims: {
        post: postDim.values,
        postRaw: postRawDim.values,
        country: countryDim.values,
        sourceFormat: sourceFormatDim.values,
        sourceFile: sourceFileDim.values,
      },
      cols: sorted,
    },
    stats: {
      sourceRows: records.length,
      keptRows: sorted.visa.length,
      distinctMonths: months.size,
      distinctPosts: postDim.values.length,
      distinctCountries: countryDim.values.length,
      sourceFormats: sourceFormatDim.values,
    },
  };
}

/** Precomputed country metrics — 209 rows, shipped as records. */
function buildCountryMetrics(records) {
  const NUMERIC = new Set([
    "first_year", "latest_year", "first_f1", "first_j1", "latest_f1", "latest_j1",
    "f1_5yr_base_year", "f1_5yr_base", "f1_growth_5yr_pct", "f1_10yr_base_year",
    "f1_10yr_base", "f1_growth_10yr_pct", "f1_cagr_10yr_pct", "f1_cagr_full_pct",
    "j1_5yr_base_year", "j1_5yr_base", "j1_growth_5yr_pct", "j1_10yr_base_year",
    "j1_10yr_base", "j1_growth_10yr_pct", "j1_cagr_10yr_pct", "j1_cagr_full_pct",
    "peak_historical_f1", "peak_historical_f1_year", "peak_historical_j1",
    "peak_historical_j1_year", "f1_volatility_score", "j1_volatility_score",
    "volatility_score",
  ]);

  const camel = (key) => key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

  const items = records.map((record) => {
    const item = {};
    for (const [key, value] of Object.entries(record)) {
      item[camel(key)] = NUMERIC.has(key) ? num(value) : String(value ?? "").trim();
    }
    return item;
  });

  return {
    table: { schema: "country-metrics@1", rowCount: items.length, items },
    stats: { sourceRows: records.length, keptRows: items.length },
  };
}

async function writeJson(outDir, name, payload) {
  const file = path.join(outDir, name);
  const json = JSON.stringify(payload);
  await writeFile(file, json);
  await pipeline(createReadStream(file), createGzip({ level: 9 }), createWriteStream(`${file}.gz`));
  const [raw, gz] = await Promise.all([stat(file), stat(`${file}.gz`)]);
  return { name, bytes: raw.size, gzipBytes: gz.size };
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const srcDir = path.resolve(ROOT, args.src);
  const outDir = path.resolve(ROOT, args.out);

  const sources = {
    operational: path.join(srcDir, "student_visa_consulate_master.csv"),
    annualCountry: path.join(
      srcDir,
      "processed/annual_country_historical/f1_j1_historical_1997_2024_harmonized.csv",
    ),
    countryMetrics: path.join(
      srcDir,
      "processed/annual_country_historical/country_historical_metrics.csv",
    ),
    postsMonthly: path.join(
      srcDir,
      "processed/monthly_post_operational/monthly_by_post_f1_j1_2017_2025_candidate.csv",
    ),
  };

  for (const [key, file] of Object.entries(sources)) {
    try {
      await stat(file);
    } catch {
      fail(`missing source CSV for "${key}":\n    ${file}\n\n  Pass --src <dir> if the CSVs live elsewhere.`);
    }
  }

  const reference = JSON.parse(
    await readFile(path.join(ROOT, "scripts/dashboard/reference-maps.json"), "utf8"),
  );

  await mkdir(outDir, { recursive: true });

  const operational = buildOperational(await readCsv(sources.operational), reference);
  const annualCountry = buildAnnualCountry(await readCsv(sources.annualCountry));
  const postsMonthly = buildPostsMonthly(await readCsv(sources.postsMonthly));
  const countryMetrics = buildCountryMetrics(await readCsv(sources.countryMetrics));

  const written = [];
  written.push(await writeJson(outDir, "operational.json", operational.table));
  written.push(await writeJson(outDir, "annual-country.json", annualCountry.table));
  written.push(await writeJson(outDir, "posts-monthly.json", postsMonthly.table));
  written.push(await writeJson(outDir, "country-metrics.json", countryMetrics.table));
  written.push(
    await writeJson(outDir, "reference.json", {
      schema: "reference@1",
      countryCoords: reference.countryCoords,
    }),
  );

  const manifest = {
    schema: "manifest@1",
    files: written.map((f) => f.name),
    coverage: {
      operational: "Jan 2023 - Sep 2025, monthly by post",
      annualCountry: "FY1997 - FY2024, annual by country/nationality",
      postsMonthly: "Mar 2017 - Sep 2025, monthly by post",
    },
    counts: {
      operational: operational.stats.keptRows,
      annualCountry: annualCountry.stats.keptRows,
      postsMonthly: postsMonthly.stats.keptRows,
      countryMetrics: countryMetrics.stats.keptRows,
    },
  };
  written.push(await writeJson(outDir, "manifest.json", manifest));

  console.log(`\n  Source: ${srcDir}`);
  console.log(`  Output: ${outDir}\n`);
  for (const file of written) {
    console.log(`    ${file.name.padEnd(22)} ${kb(file.bytes).padStart(10)}  ->  ${kb(file.gzipBytes).padStart(9)} gzipped`);
  }
  const totalRaw = written.reduce((sum, f) => sum + f.bytes, 0);
  const totalGz = written.reduce((sum, f) => sum + f.gzipBytes, 0);
  console.log(`    ${"TOTAL".padEnd(22)} ${kb(totalRaw).padStart(10)}  ->  ${kb(totalGz).padStart(9)} gzipped\n`);

  console.log(`  operational:     ${operational.stats.keptRows} of ${operational.stats.sourceRows} rows kept`);
  if (operational.stats.droppedUnmappedPosts.length) {
    const posts = operational.stats.droppedUnmappedPosts;
    const rows = posts.reduce((sum, [, count]) => sum + count, 0);
    console.log(`    dropped ${rows} rows across ${posts.length} posts absent from POST_COUNTRY (matches Streamlit):`);
    for (const [post, count] of posts.slice(0, 10)) console.log(`      ${post} (${count})`);
    if (posts.length > 10) console.log(`      ... and ${posts.length - 10} more`);
  }
  if (operational.stats.countriesMissingCoords.length) {
    console.log(`    ${operational.stats.countriesMissingCoords.length} countries have no map coordinates and are absent from the globe:`);
    console.log(`      ${operational.stats.countriesMissingCoords.join(", ")}`);
  }
  console.log(`  annualCountry:   ${annualCountry.stats.keptRows} of ${annualCountry.stats.sourceRows} rows kept`);
  console.log(`  postsMonthly:    ${postsMonthly.stats.keptRows} rows, ${postsMonthly.stats.distinctMonths} months, ${postsMonthly.stats.distinctPosts} posts, source eras: ${postsMonthly.stats.sourceFormats.join(", ")}`);
  console.log(`  countryMetrics:  ${countryMetrics.stats.keptRows} rows\n`);
}

await main();
