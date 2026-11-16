/**
 * Dashboard country name → ISO 3166-1 alpha-2 code, for the panel's flags
 * (country-flag-icons, MIT, loaded only with the panel). Special reporting
 * categories (BNO passports, Palestinian Authority Travel Document, Unknown)
 * and Serbia and Montenegro (split in 2006) have no flag.
 */

export const FLAG_CODES: Readonly<Record<string, string>> = {
  Afghanistan: "AF", Albania: "AL", Algeria: "DZ", Andorra: "AD", Angola: "AO", Anguilla: "AI",
  "Antigua and Barbuda": "AG", Argentina: "AR", Armenia: "AM", Australia: "AU", Austria: "AT",
  Azerbaijan: "AZ", Bahamas: "BS", Bahrain: "BH", Bangladesh: "BD", Barbados: "BB", Belarus: "BY",
  Belgium: "BE", Belize: "BZ", Benin: "BJ", Bermuda: "BM", Bhutan: "BT", Bolivia: "BO",
  "Bosnia and Herzegovina": "BA", Botswana: "BW", Brazil: "BR", "British Virgin Islands": "VG",
  Brunei: "BN", Bulgaria: "BG", "Burkina Faso": "BF", Burundi: "BI", Cambodia: "KH", Cameroon: "CM",
  Canada: "CA", "Cape Verde": "CV", "Cayman Islands": "KY", "Central African Republic": "CF",
  Chad: "TD", Chile: "CL", China: "CN", Colombia: "CO", Comoros: "KM", "Costa Rica": "CR",
  "Cote d'Ivoire": "CI", Croatia: "HR", Cuba: "CU", Curacao: "CW", Cyprus: "CY", Czechia: "CZ",
  "Democratic Republic of the Congo": "CD", Denmark: "DK", Djibouti: "DJ", Dominica: "DM",
  "Dominican Republic": "DO", Ecuador: "EC", Egypt: "EG", "El Salvador": "SV", "Equatorial Guinea": "GQ",
  Eritrea: "ER", Estonia: "EE", Eswatini: "SZ", Ethiopia: "ET", Fiji: "FJ", Finland: "FI", France: "FR",
  Gabon: "GA", Gambia: "GM", Georgia: "GE", Germany: "DE", Ghana: "GH", Gibraltar: "GI", Greece: "GR",
  Grenada: "GD", Guatemala: "GT", Guinea: "GN", "Guinea-Bissau": "GW", Guyana: "GY", Haiti: "HT",
  Honduras: "HN", "Hong Kong": "HK", Hungary: "HU", Iceland: "IS", India: "IN", Indonesia: "ID",
  Iran: "IR", Iraq: "IQ", Ireland: "IE", Israel: "IL", Italy: "IT", Jamaica: "JM", Japan: "JP",
  Jordan: "JO", Kazakhstan: "KZ", Kenya: "KE", Kiribati: "KI", Kosovo: "XK", Kuwait: "KW",
  Kyrgyzstan: "KG", Laos: "LA", Latvia: "LV", Lebanon: "LB", Lesotho: "LS", Liberia: "LR", Libya: "LY",
  Liechtenstein: "LI", Lithuania: "LT", Luxembourg: "LU", Macau: "MO", Madagascar: "MG", Malawi: "MW",
  Malaysia: "MY", Maldives: "MV", Mali: "ML", Malta: "MT", "Marshall Islands": "MH", Mauritania: "MR",
  Mauritius: "MU", Mexico: "MX", Micronesia: "FM", Moldova: "MD", Monaco: "MC", Mongolia: "MN",
  Montenegro: "ME", Montserrat: "MS", Morocco: "MA", Mozambique: "MZ", Myanmar: "MM", Namibia: "NA",
  Nauru: "NR", Nepal: "NP", Netherlands: "NL", "New Zealand": "NZ", Nicaragua: "NI", Niger: "NE",
  Nigeria: "NG", "North Korea": "KP", "North Macedonia": "MK", Norway: "NO", Oman: "OM", Pakistan: "PK",
  Palau: "PW", Panama: "PA", "Papua New Guinea": "PG", Paraguay: "PY", Peru: "PE", Philippines: "PH",
  Poland: "PL", Portugal: "PT", Qatar: "QA", "Republic of the Congo": "CG", Romania: "RO", Russia: "RU",
  Rwanda: "RW", "Saint Kitts and Nevis": "KN", "Saint Lucia": "LC", "Saint Vincent and the Grenadines": "VC",
  Samoa: "WS", "San Marino": "SM", "Sao Tome and Principe": "ST", "Saudi Arabia": "SA", Senegal: "SN",
  Serbia: "RS", Seychelles: "SC", "Sierra Leone": "SL", Singapore: "SG", Slovakia: "SK", Slovenia: "SI",
  "Solomon Islands": "SB", Somalia: "SO", "South Africa": "ZA", "South Korea": "KR", "South Sudan": "SS",
  Spain: "ES", "Sri Lanka": "LK", Sudan: "SD", Suriname: "SR", Sweden: "SE", Switzerland: "CH",
  Syria: "SY", Taiwan: "TW", Tajikistan: "TJ", Tanzania: "TZ", Thailand: "TH", "Timor-Leste": "TL",
  Togo: "TG", Tonga: "TO", "Trinidad and Tobago": "TT", Tunisia: "TN", Turkey: "TR", Turkmenistan: "TM",
  "Turks and Caicos Islands": "TC", Tuvalu: "TV", Uganda: "UG", Ukraine: "UA", "United Arab Emirates": "AE",
  "United Kingdom": "GB", Uruguay: "UY", Uzbekistan: "UZ", Vanuatu: "VU", "Vatican City": "VA",
  Venezuela: "VE", Vietnam: "VN", "Western Sahara": "EH", Yemen: "YE", Zambia: "ZM", Zimbabwe: "ZW",
};

/** The flag code for a dashboard country, or null (special categories, Serbia and Montenegro). */
export const flagCode = (country: string | null | undefined): string | null => (country ? (FLAG_CODES[country] ?? null) : null);
