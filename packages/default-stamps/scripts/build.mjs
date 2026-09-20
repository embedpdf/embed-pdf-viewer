/**
 * Generate `locales/<locale>.js` from `<locale>/stamps.pdf`: one ES module
 * per library exporting the PDF as base64. The libraries then travel through
 * the module graph — the one channel every bundler understands — as lazy
 * chunks of the app that uses them, instead of as asset files a toolchain
 * may or may not know how to carry. See library.js for the loader.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = ['en', 'de', 'nl', 'fr', 'es', 'zh-CN', 'sv', 'ja'];

mkdirSync(resolve(root, 'locales'), { recursive: true });
for (const locale of LOCALES) {
  const pdf = readFileSync(resolve(root, locale, 'stamps.pdf'));
  const source =
    `// Generated from ${locale}/stamps.pdf by scripts/build.mjs — do not edit.\n` +
    `export default '${pdf.toString('base64')}';\n`;
  writeFileSync(resolve(root, 'locales', `${locale}.js`), source);
}
console.log(`default-stamps: ${LOCALES.length} locale modules written`);
