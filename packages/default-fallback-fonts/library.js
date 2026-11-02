/**
 * The fonts the engine fills in Hebrew and Arabic with when the font a text names doesn't have
 * them, delivered through the module graph (`@embedpdf/default-fallback-fonts/library`).
 *
 * Each font is a generated ES module exporting its TrueType bytes as base64, loaded on demand
 * with a LITERAL dynamic import per font, so any bundler code-splits it into a lazy chunk served
 * from the app's own origin: no asset file to copy, no `new URL()`, no CDN.
 */
export const DEFAULT_FALLBACK_FONTS = [
  {
    key: 'noto-sans-hebrew',
    familyName: 'Noto Sans Hebrew',
    weight: 400,
    italic: false,
    file: 'NotoSansHebrew-Regular.ttf',
  },
  {
    key: 'noto-sans-hebrew-bold',
    familyName: 'Noto Sans Hebrew',
    weight: 700,
    italic: false,
    file: 'NotoSansHebrew-Bold.ttf',
  },
  {
    key: 'noto-naskh-arabic',
    familyName: 'Noto Naskh Arabic',
    weight: 400,
    italic: false,
    file: 'NotoNaskhArabic-Regular.ttf',
  },
  {
    key: 'noto-naskh-arabic-bold',
    familyName: 'Noto Naskh Arabic',
    weight: 700,
    italic: false,
    file: 'NotoNaskhArabic-Bold.ttf',
  },
];

const modules = {
  'noto-sans-hebrew': () => import('./modules/noto-sans-hebrew.js'),
  'noto-sans-hebrew-bold': () => import('./modules/noto-sans-hebrew-bold.js'),
  'noto-naskh-arabic': () => import('./modules/noto-naskh-arabic.js'),
  'noto-naskh-arabic-bold': () => import('./modules/noto-naskh-arabic-bold.js'),
};

/** The TrueType bytes of the font `key`, one of `DEFAULT_FALLBACK_FONTS`. */
export async function loadFallbackFont(key) {
  const load = modules[key];
  if (!load) throw new Error(`@embedpdf/default-fallback-fonts: no font "${key}"`);
  const { default: base64 } = await load();
  return decodeBase64(base64);
}

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
