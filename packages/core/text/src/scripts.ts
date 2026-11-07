/**
 * A character's script (the Unicode `Script` property, as HarfBuzz reads it),
 * and which scripts the engine shapes with Latin's features off.
 */

const COMMON = 'Common';
const INHERITED = 'Inherited';
const UNKNOWN = 'Unknown';

/**
 * Scripts whose shaping is a matter of default features only: the engine
 * turns kerning and ligatures off for them, as Acrobat does.
 */
const SIMPLE = new Set([
  'Latin',
  'Greek',
  'Cyrillic',
  'Armenian',
  'Georgian',
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Bopomofo',
  COMMON,
  INHERITED,
  UNKNOWN,
]);

/** Every script, the likeliest first. A name this runtime's regular expressions don't know is skipped. */
const SCRIPTS = [
  COMMON,
  INHERITED,
  'Latin',
  'Hebrew',
  'Arabic',
  'Cyrillic',
  'Greek',
  'Han',
  'Hiragana',
  'Katakana',
  'Hangul',
  'Devanagari',
  'Thai',
  ...`Adlam Ahom Anatolian_Hieroglyphs Armenian Avestan Balinese Bamum Bassa_Vah Batak Bengali
    Bhaiksuki Bopomofo Brahmi Braille Buginese Buhid Canadian_Aboriginal Carian Caucasian_Albanian
    Chakma Cham Cherokee Chorasmian Coptic Cuneiform Cypriot Cypro_Minoan Deseret Dives_Akuru Dogra
    Duployan Egyptian_Hieroglyphs Elbasan Elymaic Ethiopic Garay Georgian Glagolitic Gothic Grantha
    Gujarati Gunjala_Gondi Gurmukhi Gurung_Khema Hanifi_Rohingya Hanunoo Hatran Imperial_Aramaic
    Inscriptional_Pahlavi Inscriptional_Parthian Javanese Kaithi Kannada Kawi Kayah_Li Kharoshthi
    Khitan_Small_Script Khmer Khojki Khudawadi Kirat_Rai Lao Lepcha Limbu Linear_A Linear_B Lisu
    Lycian Lydian Mahajani Makasar Malayalam Mandaic Manichaean Marchen Masaram_Gondi Medefaidrin
    Meetei_Mayek Mende_Kikakui Meroitic_Cursive Meroitic_Hieroglyphs Miao Modi Mongolian Mro Multani
    Myanmar Nabataean Nag_Mundari Nandinagari New_Tai_Lue Newa Nko Nushu Nyiakeng_Puachue_Hmong
    Ogham Ol_Chiki Ol_Onal Old_Hungarian Old_Italic Old_North_Arabian Old_Permic Old_Persian
    Old_Sogdian Old_South_Arabian Old_Turkic Old_Uyghur Oriya Osage Osmanya Pahawh_Hmong Palmyrene
    Pau_Cin_Hau Phags_Pa Phoenician Psalter_Pahlavi Rejang Runic Samaritan Saurashtra Sharada
    Shavian Siddham SignWriting Sinhala Sogdian Sora_Sompeng Soyombo Sundanese Sunuwar Syloti_Nagri
    Syriac Tagalog Tagbanwa Tai_Le Tai_Tham Tai_Viet Takri Tamil Tangsa Tangut Telugu Thaana Tibetan
    Tifinagh Tirhuta Todhri Toto Tulu_Tigalari Ugaritic Vai Vithkuqi Wancho Warang_Citi Yezidi Yi
    Zanabazar_Square`.split(/\s+/),
];

let matchers: [string, RegExp][] | undefined;
const known = new Map<number, string>();

function scriptMatchers(): [string, RegExp][] {
  if (matchers) return matchers;
  matchers = [];
  for (const name of new Set(SCRIPTS)) {
    try {
      matchers.push([name, new RegExp(`^\\p{Script=${name}}$`, 'u')]);
    } catch {
      // A script newer than this runtime's Unicode data.
    }
  }
  return matchers;
}

/** The script of `codePoint`: `'Common'`, `'Inherited'`, `'Unknown'` or a script's name. */
export function scriptOf(codePoint: number): string {
  const cached = known.get(codePoint);
  if (cached !== undefined) return cached;
  const character = String.fromCodePoint(codePoint);
  const script = scriptMatchers().find(([, matcher]) => matcher.test(character))?.[0] ?? UNKNOWN;
  known.set(codePoint, script);
  return script;
}

/** Spaces, digits, punctuation, marks: characters that take their neighbours' script. */
export const isCommonScript = (script: string): boolean =>
  script === COMMON || script === INHERITED || script === UNKNOWN;

export const isSimpleScript = (script: string): boolean => SIMPLE.has(script);
