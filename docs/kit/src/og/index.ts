/**
 * Social-card machinery shared by embedpdf.com and cloudpdf.com.
 *
 * Deliberately NOT re-exported from ../index.ts: that barrel is the client
 * component surface, and this module pulls in Satori and shiki. Sites import
 * it as `@embedpdf/docs-kit/og` from a server route only.
 *
 * See DOCS-PLATFORM-ARCHITECTURE.md — this is the L1 "OG handlers" entry.
 */
export {
  BRAND_BOOK_PALETTE,
  resolvePalette,
  type DocsOgBrand,
  type OgCodePalette,
  type OgPalette,
} from './brand';
export { DocsOgCard, OG_HEIGHT, OG_WIDTH, type DocsOgPage } from './card';
export { canRenderText, loadOgFonts, OG_FONT_FAMILIES, type OgFont } from './fonts';
export { highlightOgSnippet, type OgLine, type OgToken } from './highlight';
export {
  OVERFLOW_ROWS,
  VISIBLE_ROWS,
  fitsPanel,
  panelRows,
  toPanelRows,
  type PanelRow,
} from './panel';
export { createDocsOgResponse, type DocsOgInput } from './response';
export {
  ogSnippetFilename,
  selectOgSnippet,
  snippetFromFrontmatter,
  type OgSnippet,
} from './snippet';
