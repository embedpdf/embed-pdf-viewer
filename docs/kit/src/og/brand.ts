/**
 * The OG card's theme contract — the Satori-side twin of ../tokens.ts.
 *
 * Kit components on a page style themselves with `--dk-*` CSS variables, but
 * an OG card is rasterised outside any document and Satori resolves no
 * variables: every colour has to reach it as a literal. This file is that
 * literal set.
 *
 * It is deliberately ONE palette, not a per-site fork. Both brands are drawn
 * from the same Figma colour/type system (the file is headed "EmbedPDF /
 * CloudPDF"), so the shared book is the whole default and `DocsOgBrand`
 * carries only what a site genuinely owns — today, its logo and its domain.
 * Same category as the shared dark code shell in ../tokens.ts: brand-shared
 * literals live in the kit.
 *
 * Adding a key here is an API change, exactly as it is in ../tokens.ts.
 */

/** The dark code card: its shell plus the four ink colours a snippet uses. */
export interface OgCodePalette {
  surface: string;
  border: string;
  shadow: string;
  /** The tab strip behind the window chrome — a shade under `surface`. */
  bar: string;
  /** Hairline on the strip and around the active tab. */
  barBorder: string;
  /** The active tab's leading dot. */
  tabDot: string;
  /** The three window dots. */
  chrome: string;
  filename: string;
  /** Line-number gutter and its rule. */
  gutter: string;
  gutterRule: string;
  /** The bottom fade, shown only when a snippet runs past the panel. Four
   *  stops from transparent to `surface`, so the code reads as continuing. */
  fadeFrom: string;
  fadeMid: string;
  fadeDeep: string;
  /** Snippet ink. `entity` is functions/hooks/types; `muted` is strings,
   *  comments and punctuation. See ./highlight.ts for the scope mapping. */
  plain: string;
  keyword: string;
  entity: string;
  muted: string;
  /** Brackets and tag delimiters — dimmer than `plain`, so JSX reads as
   *  structure rather than competing with the names inside it. */
  punctuation: string;
}

export interface OgPalette {
  surface: string;
  /** The masked dot lattice behind everything. */
  dot: string;
  /** The 8px top rule, left → right. */
  rule: [string, string, string];
  accent: string;
  /** The short bar under the title — a heavier blue than `accent`. */
  accentBar: string;
  navy: string;
  mist: string;
  divider: string;
  title: string;
  body: string;
  urlInk: string;
  urlMuted: string;
  footerDot: string;
  code: OgCodePalette;
}

export const BRAND_BOOK_PALETTE: OgPalette = {
  surface: '#FAFBFF',
  dot: '#D8E4FB',
  rule: ['#0A1A4D', '#1677FF', '#7DB6FF'],
  accent: '#1677FF',
  accentBar: '#006FFD',
  navy: '#0A1A4D',
  mist: '#E6F0FF',
  divider: '#CFD5E1',
  title: '#011850',
  body: '#515B7E',
  urlInk: '#031E50',
  urlMuted: '#A8B4CC',
  footerDot: '#ABC9FD',
  code: {
    surface: '#0A1A4D',
    border: 'rgba(125, 182, 255, 0.28)',
    shadow: '0 18px 48px rgba(10, 26, 77, 0.30)',
    bar: '#061238',
    barBorder: 'rgba(125, 182, 255, 0.22)',
    tabDot: '#2CADF4',
    chrome: 'rgba(230, 240, 255, 0.22)',
    filename: '#8FA6D8',
    gutter: 'rgba(143, 166, 216, 0.45)',
    gutterRule: 'rgba(125, 182, 255, 0.14)',
    fadeFrom: 'rgba(10, 26, 77, 0)',
    fadeMid: 'rgba(10, 26, 77, 0.18)',
    fadeDeep: 'rgba(10, 26, 77, 0.62)',
    plain: '#E6F0FF',
    keyword: '#7DB6FF',
    entity: '#2CADF4',
    muted: '#8FA6D8',
    punctuation: '#6C82B8',
  },
};

/**
 * What a site supplies. Everything else about the card is shared machinery.
 *
 * The logo carries explicit dimensions because Satori will not measure an
 * SVG for you, and the two lockups are genuinely different shapes
 * (EmbedPDF 692×134, CloudPDF 697×107) — a card that guessed would letterbox
 * one of them.
 */
export interface DocsOgBrand {
  /** Full lockup as a `data:` URI; height should render at 46px. */
  logo: { src: string; width: number; height: number };
  /** Footer URL prefix, e.g. `embedpdf.com` — no scheme, no trailing slash. */
  origin: string;
  /** The word beside the logo. */
  eyebrow?: string;
  /** Narrow overrides on the shared book. Today both sites pass none. */
  palette?: Partial<OgPalette>;
}

export function resolvePalette(brand: DocsOgBrand): OgPalette {
  if (!brand.palette) return BRAND_BOOK_PALETTE;
  return {
    ...BRAND_BOOK_PALETTE,
    ...brand.palette,
    code: { ...BRAND_BOOK_PALETTE.code, ...(brand.palette.code ?? {}) },
  };
}
