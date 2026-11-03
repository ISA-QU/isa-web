/**
 * The panel's greeting in the selected country's main language. Countries not
 * listed (including those where English is an official language) get the
 * rotating greetings instead. Reviewed by the dashboard owner before commit.
 */

export interface Greeting {
  text: string;
  language: string;
}

const g = (text: string, language: string): Greeting => ({ text, language });

const SPANISH = g("Hola", "Spanish");
const PORTUGUESE = g("Olá", "Portuguese");
const FRENCH = g("Bonjour", "French");
const ARABIC = g("Marhaba", "Arabic");
const GERMAN = g("Hallo", "German");

const by = (greeting: Greeting, countries: readonly string[]) => countries.map((c) => [c, greeting] as const);

export const GREETINGS: Readonly<Record<string, Greeting>> = Object.fromEntries([
  ["India", g("Namaste", "Hindi")],
  ["Nepal", g("Namaste", "Nepali")],
  ["Vietnam", g("Xin chào", "Vietnamese")],
  ["China", g("Nǐ hǎo", "Mandarin")],
  ["Taiwan", g("Nǐ hǎo", "Mandarin")],
  ["Hong Kong", g("Néih hóu", "Cantonese")],
  ["Macau", g("Néih hóu", "Cantonese")],
  ["Japan", g("Konnichiwa", "Japanese")],
  ["South Korea", g("Annyeonghaseyo", "Korean")],
  ["North Korea", g("Annyeonghaseyo", "Korean")],
  ["Bangladesh", g("Assalamu alaikum", "Bengali")],
  ["Sri Lanka", g("Ayubowan", "Sinhala")],
  ["Pakistan", g("Assalam-o-Alaikum", "Urdu")],
  ["Afghanistan", g("Salam", "Dari")],
  ["Iran", g("Salam", "Persian")],
  ["Turkey", g("Merhaba", "Turkish")],
  ["Israel", g("Shalom", "Hebrew")],
  ["Thailand", g("Sawasdee", "Thai")],
  ["Indonesia", g("Halo", "Indonesian")],
  ["Malaysia", g("Apa khabar", "Malay")],
  ["Philippines", g("Kumusta", "Filipino")],
  ["Myanmar", g("Mingalaba", "Burmese")],
  ["Cambodia", g("Suostei", "Khmer")],
  ["Laos", g("Sabaidee", "Lao")],
  ["Mongolia", g("Sain baina uu", "Mongolian")],
  ["Russia", g("Zdravstvuyte", "Russian")],
  ["Belarus", g("Zdravstvuyte", "Russian")],
  ["Ukraine", g("Dobryi den", "Ukrainian")],
  ["Kazakhstan", g("Sälem", "Kazakh")],
  ["Kyrgyzstan", g("Salam", "Kyrgyz")],
  ["Uzbekistan", g("Salom", "Uzbek")],
  ["Tajikistan", g("Salom", "Tajik")],
  ["Turkmenistan", g("Salam", "Turkmen")],
  ["Azerbaijan", g("Salam", "Azerbaijani")],
  ["Georgia", g("Gamarjoba", "Georgian")],
  ["Armenia", g("Barev", "Armenian")],
  ["Greece", g("Yia sou", "Greek")],
  ["Cyprus", g("Yia sou", "Greek")],
  ["Ethiopia", g("Selam", "Amharic")],
  ["Eritrea", g("Selam", "Tigrinya")],
  ["Kenya", g("Habari", "Swahili")],
  ["Tanzania", g("Habari", "Swahili")],
  ["Haiti", g("Bonjou", "Haitian Creole")],
  ["Italy", g("Ciao", "Italian")],
  ["San Marino", g("Ciao", "Italian")],
  ["Switzerland", g("Grüezi", "Swiss German")],
  ["Netherlands", g("Hallo", "Dutch")],
  ["Belgium", g("Hallo", "Dutch")],
  ["Suriname", g("Hallo", "Dutch")],
  ["Poland", g("Cześć", "Polish")],
  ["Czechia", g("Ahoj", "Czech")],
  ["Slovakia", g("Ahoj", "Slovak")],
  ["Hungary", g("Szia", "Hungarian")],
  ["Romania", g("Bună", "Romanian")],
  ["Moldova", g("Bună", "Romanian")],
  ["Bulgaria", g("Zdravei", "Bulgarian")],
  ["Serbia", g("Zdravo", "Serbian")],
  ["Montenegro", g("Zdravo", "Montenegrin")],
  ["Bosnia and Herzegovina", g("Zdravo", "Bosnian")],
  ["North Macedonia", g("Zdravo", "Macedonian")],
  ["Croatia", g("Bok", "Croatian")],
  ["Slovenia", g("Živjo", "Slovenian")],
  ["Albania", g("Përshëndetje", "Albanian")],
  ["Kosovo", g("Përshëndetje", "Albanian")],
  ["Sweden", g("Hej", "Swedish")],
  ["Denmark", g("Hej", "Danish")],
  ["Norway", g("Hei", "Norwegian")],
  ["Finland", g("Moi", "Finnish")],
  ["Iceland", g("Halló", "Icelandic")],
  ["Estonia", g("Tere", "Estonian")],
  ["Latvia", g("Sveiki", "Latvian")],
  ["Lithuania", g("Labas", "Lithuanian")],
  ...by(GERMAN, ["Germany", "Austria", "Liechtenstein"]),
  ...by(SPANISH, [
    "Mexico", "Colombia", "Spain", "Argentina", "Chile", "Peru", "Venezuela", "Ecuador", "Bolivia", "Paraguay",
    "Uruguay", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Costa Rica", "Panama", "Cuba",
    "Dominican Republic", "Equatorial Guinea",
  ]),
  ...by(PORTUGUESE, ["Brazil", "Portugal", "Angola", "Mozambique", "Cape Verde", "Guinea-Bissau", "Sao Tome and Principe", "Timor-Leste"]),
  ...by(FRENCH, [
    "France", "Monaco", "Senegal", "Cote d'Ivoire", "Cameroon", "Mali", "Burkina Faso", "Niger", "Benin", "Togo",
    "Guinea", "Gabon", "Chad", "Democratic Republic of the Congo", "Republic of the Congo", "Central African Republic",
    "Madagascar", "Djibouti", "Burundi", "Comoros",
  ]),
  ...by(ARABIC, [
    "Saudi Arabia", "United Arab Emirates", "Egypt", "Jordan", "Lebanon", "Kuwait", "Qatar", "Bahrain", "Oman",
    "Iraq", "Syria", "Yemen", "Libya", "Tunisia", "Algeria", "Morocco", "Sudan", "Mauritania",
  ]),
]);

/** Shown in turn when the selected country has no greeting above. */
export const ROTATING_GREETINGS: readonly Greeting[] = [
  g("Hello", "English"),
  g("Namaste", "Hindi"),
  g("Xin chào", "Vietnamese"),
  g("Olá", "Portuguese"),
  g("Hola", "Spanish"),
  g("Nǐ hǎo", "Mandarin"),
  g("Bonjour", "French"),
  g("Annyeonghaseyo", "Korean"),
];

/** The selected country's greeting, or null to rotate. */
export const greetingFor = (country: string | null | undefined): Greeting | null => (country ? (GREETINGS[country] ?? null) : null);
