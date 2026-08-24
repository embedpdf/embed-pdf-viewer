/**
 * The card's typefaces, as buffers Satori can actually parse.
 *
 * Both sites already load the same pair through `next/font/google` (Inter on
 * `--font-sans`, Manrope on `--font-display`), so the card is not choosing a
 * look — it reproduces the one the sites already have. next/font hands back
 * CSS, never bytes, so the faces are vendored here instead.
 *
 * Two constraints shaped this:
 *
 * - Format. Satori reads ttf/otf/woff and CANNOT read woff2 — there is no
 *   brotli decoder in the bundled build, and a woff2 fails at render time
 *   rather than at build time. These are `.woff`.
 * - Resolution. The faces arrive as base64 from ./fonts.data.ts rather than
 *   being read off disk, because every path-based form breaks under bundling
 *   — see scripts/build-og-fonts.mjs, which regenerates that file and records
 *   the failure modes. A string constant has nothing left to resolve.
 *
 * Decoded once per process and cached: a docs build renders a few hundred
 * cards off this one pass.
 */
import { INTER_400, JETBRAINS_MONO_400, MANROPE_700, MANROPE_800 } from './fonts.data';

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 700 | 800;
  style: 'normal';
}

/** Family names the card's `fontFamily` values refer to. */
export const OG_FONT_FAMILIES = {
  display: 'Manrope',
  body: 'Inter',
  mono: 'JetBrains Mono',
} as const;

const FACES: ReadonlyArray<{ name: string; weight: 400 | 700 | 800; base64: string }> = [
  { name: 'Manrope', weight: 800, base64: MANROPE_800 },
  { name: 'Manrope', weight: 700, base64: MANROPE_700 },
  { name: 'Inter', weight: 400, base64: INTER_400 },
  { name: 'JetBrains Mono', weight: 400, base64: JETBRAINS_MONO_400 },
];

let cached: OgFont[] | null = null;

export function loadOgFonts(): OgFont[] {
  if (!cached) {
    cached = FACES.map(({ name, weight, base64 }) => ({
      name,
      weight,
      style: 'normal' as const,
      data: Buffer.from(base64, 'base64'),
    }));
  }
  return cached;
}

/**
 * The characters the embedded faces can actually draw.
 *
 * These are the LATIN subsets, so anything outside them has no glyph — and
 * Satori's response to a missing glyph is to go and download a font, which
 * turns a static build into a network call (and failed with a 400 the first
 * time a page with box-drawing diagrams reached it). Blocks needing glyphs we
 * do not carry are skipped by ./snippet.ts instead.
 *
 * Ranges are `@fontsource`'s latin unicode-range, which the three faces share.
 */
const LATIN_SUBSET =
  /^[\u0000-\u00FF\u0131\u0152\u0153\u02BB\u02BC\u02C6\u02DA\u02DC\u0304\u0308\u0329\u2000-\u206F\u20AC\u2122\u2191\u2193\u2212\u2215\uFEFF\uFFFD]*$/u;

export function canRenderText(value: string) {
  return LATIN_SUBSET.test(value);
}
