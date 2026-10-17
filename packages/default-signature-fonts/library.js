/**
 * The default handwriting fonts for typed signatures, delivered through the module graph
 * (`@embedpdf/default-signature-fonts/library`).
 *
 * Each font is a generated ES module exporting its TrueType bytes as base64, loaded on demand
 * with a LITERAL dynamic import per font, so any bundler code-splits it into a lazy chunk served
 * from the app's own origin: no asset file to copy, no `new URL()`, no CDN.
 */
export const DEFAULT_SIGNATURE_FONTS = [
  { key: 'allura', familyName: 'Allura', label: 'Allura' },
  { key: 'great-vibes', familyName: 'Great Vibes', label: 'Great Vibes' },
  { key: 'caveat', familyName: 'Caveat', label: 'Caveat' },
];

const modules = {
  allura: () => import('./modules/allura.js'),
  'great-vibes': () => import('./modules/great-vibes.js'),
  caveat: () => import('./modules/caveat.js'),
};

/** The TrueType bytes of the font `key`, one of `DEFAULT_SIGNATURE_FONTS`. */
export async function loadSignatureFont(key) {
  const load = modules[key];
  if (!load) throw new Error(`@embedpdf/default-signature-fonts: no font "${key}"`);
  const { default: base64 } = await load();
  return decodeBase64(base64);
}

function decodeBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
