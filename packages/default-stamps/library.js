/**
 * The default stamp libraries, delivered through the module graph
 * (`@embedpdf/default-stamps/library`).
 *
 * Each locale is a generated ES module exporting its PDF as base64, loaded
 * on demand with a LITERAL dynamic import per locale so any bundler can
 * code-split it into a lazy chunk served from the app's own origin. No
 * asset file to copy, no `new URL()` for a toolchain to mishandle, no CDN:
 * the library ships inside whatever ships this package.
 */
export const LOCALES = ['en', 'de', 'nl', 'fr', 'es', 'zh-CN', 'sv', 'ja'];

const modules = {
  en: () => import('./locales/en.js'),
  de: () => import('./locales/de.js'),
  nl: () => import('./locales/nl.js'),
  fr: () => import('./locales/fr.js'),
  es: () => import('./locales/es.js'),
  'zh-CN': () => import('./locales/zh-CN.js'),
  sv: () => import('./locales/sv.js'),
  ja: () => import('./locales/ja.js'),
};

/** The library PDF for `locale` (a shipped code; anything else → `en`). */
export async function loadDefaultLibrary(locale) {
  const load = modules[locale] ?? modules.en;
  const { default: base64 } = await load();
  return decodeBase64(base64);
}

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
