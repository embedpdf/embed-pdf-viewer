/**
 * Generate `modules/<key>.js` from `fonts/<file>.ttf`: one ES module per font exporting its bytes
 * as base64. The fonts then travel through the module graph, the one channel every bundler
 * understands, as lazy chunks of the app that uses them, instead of as asset files a toolchain may
 * or may not know how to carry. See library.js for the loader.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FONTS = {
  'noto-sans-hebrew': 'NotoSansHebrew-Regular.ttf',
  'noto-sans-hebrew-bold': 'NotoSansHebrew-Bold.ttf',
  'noto-naskh-arabic': 'NotoNaskhArabic-Regular.ttf',
  'noto-naskh-arabic-bold': 'NotoNaskhArabic-Bold.ttf',
};

mkdirSync(resolve(root, 'modules'), { recursive: true });
for (const [key, file] of Object.entries(FONTS)) {
  const bytes = readFileSync(resolve(root, 'fonts', file));
  const source =
    `// Generated from fonts/${file} by scripts/build.mjs — do not edit.\n` +
    `export default '${bytes.toString('base64')}';\n`;
  writeFileSync(resolve(root, 'modules', `${key}.js`), source);
}
console.log(`default-fallback-fonts: ${Object.keys(FONTS).length} font modules written`);
