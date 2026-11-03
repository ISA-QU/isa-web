/**
 * Finds a dashboard country from what someone typed: exact names, a few common
 * other names, and "did you mean…" for near misses. Used by the tools now and
 * by the question matcher in Step 2 (which adds more aliases and demonyms here).
 */

/** Lowercase, no accents, "&" as "and", punctuation as spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Other names → the dashboard's name. Keys are normalized. */
export const COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  korea: "South Korea",
  "republic of korea": "South Korea",
  "korea south": "South Korea",
  "korea north": "North Korea",
  uae: "United Arab Emirates",
  emirates: "United Arab Emirates",
  uk: "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  hk: "Hong Kong",
  macao: "Macau",
  burma: "Myanmar",
  "ivory coast": "Cote d'Ivoire",
  turkiye: "Turkey",
  "czech republic": "Czechia",
  swaziland: "Eswatini",
  "cabo verde": "Cape Verde",
  "east timor": "Timor-Leste",
  "viet nam": "Vietnam",
  "mainland china": "China",
  prc: "China",
  "drc": "Democratic Republic of the Congo",
  "dr congo": "Democratic Republic of the Congo",
  "congo kinshasa": "Democratic Republic of the Congo",
  "congo brazzaville": "Republic of the Congo",
  "holy see": "Vatican City",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  macedonia: "North Macedonia",
  "russian federation": "Russia",
};

/** Names for the United States, which isn't in visa data (normalized). */
const UNITED_STATES = new Set(["united states", "united states of america", "usa", "us", "u s", "u s a", "america"]);

/** Why the United States has no figures. */
export const UNITED_STATES_NOTE =
  "The United States isn't in this data: U.S. citizens don't need student (F1) or exchange visitor (J1) visas.";

export type CountryMatch =
  | { kind: "found"; country: string }
  | { kind: "united-states" }
  | { kind: "unknown"; suggestions: string[] };

/** Edit distance (insert, delete, substitute, swap two neighbours), for "did you mean…". */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * Matches `raw` against `countries` (the dashboard's names). Unknown names get
 * up to three suggestions: names starting with it, then the closest spellings.
 */
export function resolveCountry(raw: string, countries: readonly string[]): CountryMatch {
  const key = normalize(raw);
  if (!key) return { kind: "unknown", suggestions: [] };
  if (UNITED_STATES.has(key)) return { kind: "united-states" };
  const byKey = new Map(countries.map((c) => [normalize(c), c]));
  const exact = byKey.get(key) ?? (COUNTRY_ALIASES[key] && byKey.get(normalize(COUNTRY_ALIASES[key])));
  if (exact) return { kind: "found", country: exact };

  // Names starting with what was typed first, then close spellings, then names containing it.
  const limit = Math.max(1, Math.min(3, Math.floor(key.length / 3)));
  const scored = [...byKey]
    .map(([k, c]) => {
      const d = distance(key, k);
      const score = k.startsWith(key) ? 0 : d <= limit ? d : key.length >= 4 && k.includes(key) ? limit + 0.5 : d;
      return { c, score };
    })
    .filter((s) => s.score <= limit + 0.5)
    .sort((a, b) => a.score - b.score || a.c.localeCompare(b.c));
  return { kind: "unknown", suggestions: scored.slice(0, 3).map((s) => s.c) };
}
