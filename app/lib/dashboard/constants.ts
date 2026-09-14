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

export const VISA_COLORS: Record<string, string> = { F1: "#FFB81C", J1: "#3D8DDE" };

export const REGION_MAP: Record<string, string> = {
  India: "South Asia",
  Nepal: "South Asia",
  Bangladesh: "South Asia",
  Pakistan: "South Asia",
  "Sri Lanka": "South Asia",
  China: "East Asia",
  "South Korea": "East Asia",
  Japan: "East Asia",
  Taiwan: "East Asia",
  "Hong Kong": "East Asia",
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

/**
 * Monthly/operational country label -> annual-history country label.
 *
 * Empty because the rebuild-dashboard Lambda already rewrites nationality-file
 * spellings ("China - Mainland", "Korea, South") to the post data's names, so
 * both layers share one name per country.
 */
export const HISTORICAL_COUNTRY_ALIASES: Record<string, string> = {};

/**
 * Map positions for the Executive signal map and the Analytics bubble chart,
 * ported from utils/data.py's COUNTRY_COORDS. Countries missing here are left
 * off those two charts (each says how many it shows).
 */
export const COUNTRY_COORDS: Record<string, { lat: number; lon: number }> = {
  Argentina: { lat: -38.4, lon: -63.6 },
  Australia: { lat: -25.3, lon: 133.8 },
  Bangladesh: { lat: 23.7, lon: 90.4 },
  Brazil: { lat: -14.2, lon: -51.9 },
  Canada: { lat: 56.1, lon: -106.3 },
  China: { lat: 35.9, lon: 104.2 },
  Colombia: { lat: 4.6, lon: -74.1 },
  Egypt: { lat: 26.8, lon: 30.8 },
  France: { lat: 46.2, lon: 2.2 },
  Germany: { lat: 51.2, lon: 10.5 },
  Ghana: { lat: 7.9, lon: -1.0 },
  "Hong Kong": { lat: 22.3, lon: 114.2 },
  India: { lat: 20.6, lon: 78.9 },
  Indonesia: { lat: -0.8, lon: 113.9 },
  Ireland: { lat: 53.4, lon: -8.2 },
  Italy: { lat: 41.9, lon: 12.6 },
  Japan: { lat: 36.2, lon: 138.3 },
  Kazakhstan: { lat: 48.0, lon: 67.0 },
  Kenya: { lat: 0, lon: 37.9 },
  Malaysia: { lat: 4.2, lon: 101.9 },
  Mexico: { lat: 23.6, lon: -102.5 },
  Nepal: { lat: 28.4, lon: 84.1 },
  Nigeria: { lat: 9.1, lon: 8.7 },
  Pakistan: { lat: 30.4, lon: 69.3 },
  Philippines: { lat: 12.9, lon: 121.8 },
  "Saudi Arabia": { lat: 23.9, lon: 45.1 },
  Singapore: { lat: 1.35, lon: 103.8 },
  "South Africa": { lat: -30.6, lon: 22.9 },
  "South Korea": { lat: 35.9, lon: 127.8 },
  Spain: { lat: 40.5, lon: -3.7 },
  "Sri Lanka": { lat: 7.9, lon: 80.8 },
  Taiwan: { lat: 23.7, lon: 121.0 },
  Thailand: { lat: 15.9, lon: 100.9 },
  Turkey: { lat: 38.9, lon: 35.2 },
  "United Arab Emirates": { lat: 24.0, lon: 54.0 },
  "United Kingdom": { lat: 55.4, lon: -3.4 },
  Vietnam: { lat: 14.1, lon: 108.3 },
  Zimbabwe: { lat: -19.0, lon: 29.2 },
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
