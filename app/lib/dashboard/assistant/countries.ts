/**
 * Finds a dashboard country from what someone typed: exact names, a few common
 * other names, and "did you mean…" for near misses. Used by the tools now and
 * by the question matcher in Step 2 (which adds more aliases and demonyms here).
 */

/** Lowercase, no accents, "&" as "and", "what's" as "what is", no possessive "'s", punctuation as spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(what|where|how|who|that|there|it|here)[\u2019']s\b/g, "$1 is")
    .replace(/[\u2019']s\b/g, "")
    .replace(/[\u2019']/g, "")
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

/**
 * Special reporting categories in the monthly nationality data: not countries,
 * so no page, badge or flag, but answerable. Keys are normalized.
 */
export const SPECIAL_CATEGORIES: Readonly<Record<string, string>> = {
  bno: "British National Overseas (Hong Kong) Passport",
  "bno passport": "British National Overseas (Hong Kong) Passport",
  "bno passports": "British National Overseas (Hong Kong) Passport",
  "british national overseas": "British National Overseas (Hong Kong) Passport",
  "british national overseas hong kong passport": "British National Overseas (Hong Kong) Passport",
  "palestinian authority travel document": "Palestinian Authority Travel Document",
  "palestinian authority": "Palestinian Authority Travel Document",
  "palestinian territories": "Palestinian Authority Travel Document",
  palestinians: "Palestinian Authority Travel Document",
  palestinian: "Palestinian Authority Travel Document",
  palestine: "Palestinian Authority Travel Document",
};

/** Names for the United States, which isn't in visa data (normalized). */
const UNITED_STATES = new Set(["united states", "united states of america", "usa", "us", "u s", "u s a", "america"]);

/** Nationality words → country (normalized; a plural "s" also matches). */
export const DEMONYMS: Readonly<Record<string, string>> = {
  indian: "India", chinese: "China", nepali: "Nepal", nepalese: "Nepal", vietnamese: "Vietnam",
  korean: "South Korea", "south korean": "South Korea", "north korean": "North Korea", japanese: "Japan",
  taiwanese: "Taiwan", brazilian: "Brazil", nigerian: "Nigeria", ghanaian: "Ghana", kenyan: "Kenya",
  pakistani: "Pakistan", bangladeshi: "Bangladesh", "sri lankan": "Sri Lanka", saudi: "Saudi Arabia",
  iranian: "Iran", iraqi: "Iraq", mexican: "Mexico", canadian: "Canada", british: "United Kingdom",
  french: "France", german: "Germany", italian: "Italy", spanish: "Spain", turkish: "Turkey",
  colombian: "Colombia", peruvian: "Peru", chilean: "Chile", argentine: "Argentina", argentinian: "Argentina",
  venezuelan: "Venezuela", ecuadorian: "Ecuador", cuban: "Cuba", haitian: "Haiti", jamaican: "Jamaica",
  dominican: "Dominican Republic", filipino: "Philippines", philippine: "Philippines", indonesian: "Indonesia",
  thai: "Thailand", malaysian: "Malaysia", singaporean: "Singapore", burmese: "Myanmar", cambodian: "Cambodia",
  mongolian: "Mongolia", kazakh: "Kazakhstan", uzbek: "Uzbekistan", emirati: "United Arab Emirates",
  egyptian: "Egypt", ethiopian: "Ethiopia", moroccan: "Morocco", tunisian: "Tunisia", algerian: "Algeria",
  "south african": "South Africa", zimbabwean: "Zimbabwe", zambian: "Zambia", ugandan: "Uganda",
  tanzanian: "Tanzania", rwandan: "Rwanda", cameroonian: "Cameroon", senegalese: "Senegal",
  ivorian: "Cote d'Ivoire", sudanese: "Sudan", "south sudanese": "South Sudan", somali: "Somalia",
  afghan: "Afghanistan", syrian: "Syria", lebanese: "Lebanon", jordanian: "Jordan", israeli: "Israel",
  kuwaiti: "Kuwait", qatari: "Qatar", omani: "Oman", yemeni: "Yemen", russian: "Russia", ukrainian: "Ukraine",
  polish: "Poland", dutch: "Netherlands", belgian: "Belgium", swiss: "Switzerland", austrian: "Austria",
  swedish: "Sweden", norwegian: "Norway", danish: "Denmark", finnish: "Finland", irish: "Ireland",
  portuguese: "Portugal", greek: "Greece", hungarian: "Hungary", czech: "Czechia", romanian: "Romania",
  bulgarian: "Bulgaria", serbian: "Serbia", croatian: "Croatia", albanian: "Albania", georgian: "Georgia",
  armenian: "Armenia", australian: "Australia", "new zealander": "New Zealand",
};

/** Names that could mean more than one country. */
export const AMBIGUOUS: Readonly<Record<string, readonly string[]>> = {
  congo: ["Democratic Republic of the Congo", "Republic of the Congo"],
  congolese: ["Democratic Republic of the Congo", "Republic of the Congo"],
};

/** Region words → the dashboard's region names (normalized). */
export const REGION_ALIASES: Readonly<Record<string, string>> = {
  "south asia": "South Asia", "south asian": "South Asia",
  "central asia": "Central Asia", "central asian": "Central Asia",
  "east asia": "East Asia", "east asian": "East Asia",
  "southeast asia": "SE Asia", "south east asia": "SE Asia", "se asia": "SE Asia", "southeast asian": "SE Asia",
  africa: "Africa", african: "Africa", "sub saharan africa": "Africa",
  "latin america": "Latin America", "latin american": "Latin America", "south america": "Latin America",
  "central america": "Latin America", latam: "Latin America",
  europe: "Europe", european: "Europe",
  "middle east": "Middle East", "middle eastern": "Middle East", gulf: "Middle East",
  "north america": "N. America / Oceania", oceania: "N. America / Oceania", pacific: "N. America / Oceania",
};

export type Place =
  | { kind: "country"; country: string }
  | { kind: "special"; name: string }
  | { kind: "united-states" }
  | { kind: "ambiguous"; options: readonly string[]; word: string }
  | { kind: "region"; region: string };

type Phrase = { phrase: string; place: Place; plural: boolean };

const phraseCache = new WeakMap<readonly string[], Phrase[]>();

/** Every phrase that names a place, longest first (so "Guinea-Bissau" wins over "Guinea"). */
function phrases(countries: readonly string[]): Phrase[] {
  const cached = phraseCache.get(countries);
  if (cached) return cached;
  const known = new Set(countries);
  const list: Phrase[] = [];
  const add = (phrase: string, place: Place, plural = false) => {
    if (place.kind === "country" && !known.has(place.country)) return;
    list.push({ phrase, place, plural });
  };
  for (const c of countries) add(normalize(c), { kind: "country", country: c });
  for (const [k, c] of Object.entries(COUNTRY_ALIASES)) add(k, { kind: "country", country: c });
  for (const [k, c] of Object.entries(DEMONYMS)) add(k, { kind: "country", country: c }, true);
  for (const [k, n] of Object.entries(SPECIAL_CATEGORIES)) add(k, { kind: "special", name: n });
  for (const [k, o] of Object.entries(AMBIGUOUS)) add(k, { kind: "ambiguous", options: o, word: k });
  for (const k of ["united states of america", "united states", "usa", "america", "american", "americans"]) add(k, { kind: "united-states" });
  for (const [k, r] of Object.entries(REGION_ALIASES)) add(k, { kind: "region", region: r });
  list.sort((a, b) => b.phrase.length - a.phrase.length);
  phraseCache.set(countries, list);
  return list;
}

/**
 * The places named in a sentence, in the order they appear: countries (by name,
 * other name or nationality word), special categories, the United States,
 * ambiguous names and regions. Each word is used once, longest phrase first.
 */
export function findPlaces(text: string, countries: readonly string[]): Place[] {
  let rest = ` ${normalize(text)} `;
  const found: { at: number; place: Place }[] = [];
  for (const p of phrases(countries)) {
    const pattern = new RegExp(` ${p.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${p.plural ? "s?" : ""} `);
    for (let m = pattern.exec(rest); m; m = pattern.exec(rest)) {
      found.push({ at: m.index, place: p.place });
      rest = rest.slice(0, m.index + 1) + "#".repeat(m[0].length - 2) + rest.slice(m.index + m[0].length - 1);
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.place)
    .filter((p) => {
      const key = JSON.stringify(p);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

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
