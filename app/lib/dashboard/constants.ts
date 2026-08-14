/**
 * Reference tables ported verbatim from the Streamlit dashboard (app.py).
 * These are classification logic, not data — they belong in git.
 */

export const MONTH_NAMES: Record<number, string> = {
  1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
  7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec",
};

export const MONTH_NAMES_FULL: Record<number, string> = {
  1: "January", 2: "February", 3: "March", 4: "April", 5: "May", 6: "June",
  7: "July", 8: "August", 9: "September", 10: "October", 11: "November", 12: "December",
};

export const GROWTH_LABEL = "2023–2025 Jan–Sep Growth";

export const VISA_COLORS: Record<string, string> = { F1: "#FFB81C", J1: "#3D8DDE" };

export const REGION_MAP: Record<string, string> = {
  India: "South Asia",
  Nepal: "South Asia",
  Bangladesh: "South Asia",
  Pakistan: "South Asia",
  "Sri Lanka": "South Asia",
  China: "East Asia",
  "China - mainland": "East Asia",
  "South Korea": "East Asia",
  Japan: "East Asia",
  Taiwan: "East Asia",
  "Hong Kong": "East Asia",
  "Hong Kong S.A.R.": "East Asia",
  Vietnam: "SE Asia",
  Thailand: "SE Asia",
  Philippines: "SE Asia",
  Indonesia: "SE Asia",
  Malaysia: "SE Asia",
  Singapore: "SE Asia",
  Nigeria: "Africa",
  Ghana: "Africa",
  Kenya: "Africa",
  "South Africa": "Africa",
  Zimbabwe: "Africa",
  Ethiopia: "Africa",
  Egypt: "Africa",
  Morocco: "Africa",
  Brazil: "Latin America",
  Colombia: "Latin America",
  Mexico: "Latin America",
  Peru: "Latin America",
  Argentina: "Latin America",
  Chile: "Latin America",
  Ecuador: "Latin America",
  Jamaica: "Latin America",
  "United Kingdom": "Europe",
  France: "Europe",
  Germany: "Europe",
  Spain: "Europe",
  Italy: "Europe",
  Netherlands: "Europe",
  Ireland: "Europe",
  Turkey: "Europe",
  "Saudi Arabia": "Middle East",
  "United Arab Emirates": "Middle East",
  Jordan: "Middle East",
  Lebanon: "Middle East",
  Qatar: "Middle East",
  Canada: "N. America / Oceania",
  Australia: "N. America / Oceania",
  "New Zealand": "N. America / Oceania",
};

/** Monthly/operational country label -> annual-history country label. */
export const HISTORICAL_COUNTRY_ALIASES: Record<string, string> = {
  China: "China - mainland",
  "Hong Kong": "Hong Kong S.A.R.",
  Macau: "Macau S.A.R.",
};

/** The inverse: annual-history label -> monthly/operational label. */
export const MONTHLY_COUNTRY_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(HISTORICAL_COUNTRY_ALIASES).map(([key, value]) => [value, key]),
);

export const MARKET_CATEGORIES = [
  "Core",
  "Growth",
  "Emerging",
  "Recovery",
  "Watch",
  "Declining",
] as const;

/** QU brand palette, matching utils/theme.py. */
export const QU = {
  navy: "#0C2340",
  navyLight: "#0F2D52",
  gold: "#FFB81C",
  blue: "#3D8DDE",
  positive: "#4ADE80",
  negative: "#F87171",
} as const;
