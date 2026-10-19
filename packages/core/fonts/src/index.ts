/**
 * The 14 standard PDF fonts as the engine draws them. PDFium draws a standard
 * font that a document doesn't embed with one of its own built-in faces, on
 * every platform; this package holds those faces as OpenType programs a
 * browser can load, and the numbers the engine lays text out with in them.
 * Generated from the fork's font data (scripts/generate-standard-fonts.mjs).
 */
export { standardFontMetrics, type StandardFontMetrics } from './standard/metrics';
export { fontProgramFamily, standardFontProgram, type FontProgram } from './standard/programs';
export { standardFontCss, type StandardFontCss } from './standard/css';
