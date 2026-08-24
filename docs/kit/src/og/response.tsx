/**
 * The one call a site's OG route makes.
 *
 * Highlighting happens here rather than in the site so the theme, the token
 * mapping and the font set stay a kit decision — a site supplies its logo and
 * its domain, never its own idea of what code looks like.
 */
import { ImageResponse } from 'next/og';

import { resolvePalette, type DocsOgBrand } from './brand';
import { DocsOgCard, OG_HEIGHT, OG_WIDTH, type DocsOgPage } from './card';
import { loadOgFonts } from './fonts';
import { highlightOgSnippet } from './highlight';
import type { OgSnippet } from './snippet';

export interface DocsOgInput extends Omit<DocsOgPage, 'snippet'> {
  /** Unhighlighted; this function tokenises it. */
  snippet?: OgSnippet | null;
}

export async function createDocsOgResponse(brand: DocsOgBrand, page: DocsOgInput) {
  const palette = resolvePalette(brand);
  const snippet = page.snippet
    ? {
        ...page.snippet,
        lines: await highlightOgSnippet(page.snippet.code, page.snippet.lang, palette.code),
      }
    : null;

  return new ImageResponse(<DocsOgCard brand={brand} page={{ ...page, snippet }} />, {
    fonts: loadOgFonts(),
    height: OG_HEIGHT,
    width: OG_WIDTH,
  });
}
