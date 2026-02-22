// ────────────────────────────────────────────────────────────────────────────
//  🅰  Font Families & style flags
// ────────────────────────────────────────────────────────────────────────────

import { PdfStandardFont } from '../pdf';

/**
 * Logical families of the 14 “Standard PDF” fonts.
 */
export enum PdfStandardFontFamily {
  Courier = 'Courier',
  Helvetica = 'Helvetica',
  Times = 'Times',
  Symbol = 'Symbol',
  ZapfDingbats = 'ZapfDingbats',
  Unknown = 'Unknown',
}

const DEFAULT_FALLBACK_FONT = PdfStandardFont.Helvetica;

/** UI sentinel when multiple different fonts are selected at once.            */
export const MixedStandardFont = Symbol('mixed');
export type UiStandardFontValue = PdfStandardFont | typeof MixedStandardFont;

interface StandardFontDescriptor {
  /** Enum value as returned by PDFium. */
  id: PdfStandardFont;
  /** Logical family (for the left dropdown).   */
  family: PdfStandardFontFamily;
  /** `true` ⇢ weight ≥ 700.                    */
  bold: boolean;
  /** `true` ⇢ italic / oblique.                */
  italic: boolean;
  /** Human-readable label (“Helvetica Bold”).  */
  label: string;
  /** CSS `font-family` fallback list.          */
  css: string;
}

const HELVETICA_DESC: StandardFontDescriptor = {
  id: PdfStandardFont.Helvetica,
  family: PdfStandardFontFamily.Helvetica,
  bold: false,
  italic: false,
  label: 'Helvetica',
  css: 'Helvetica, Arial, sans-serif',
} as const;

/*
 * Canonical table – order follows enum values.
 *
 * The `css` field is the **base family** only (same for every variant within a
 * family).  Bold / italic are expressed through separate CSS properties – see
 * `standardFontCssProperties`.
 */
const STANDARD_FONT_DESCRIPTORS: readonly StandardFontDescriptor[] = Object.freeze([
  {
    id: PdfStandardFont.Courier,
    family: PdfStandardFontFamily.Courier,
    bold: false,
    italic: false,
    label: 'Courier',
    css: 'Courier, monospace',
  },
  {
    id: PdfStandardFont.Courier_Bold,
    family: PdfStandardFontFamily.Courier,
    bold: true,
    italic: false,
    label: 'Courier Bold',
    css: 'Courier, monospace',
  },
  {
    id: PdfStandardFont.Courier_BoldOblique,
    family: PdfStandardFontFamily.Courier,
    bold: true,
    italic: true,
    label: 'Courier Bold Oblique',
    css: 'Courier, monospace',
  },
  {
    id: PdfStandardFont.Courier_Oblique,
    family: PdfStandardFontFamily.Courier,
    bold: false,
    italic: true,
    label: 'Courier Oblique',
    css: 'Courier, monospace',
  },
  HELVETICA_DESC,
  {
    id: PdfStandardFont.Helvetica_Bold,
    family: PdfStandardFontFamily.Helvetica,
    bold: true,
    italic: false,
    label: 'Helvetica Bold',
    css: 'Helvetica, Arial, sans-serif',
  },
  {
    id: PdfStandardFont.Helvetica_BoldOblique,
    family: PdfStandardFontFamily.Helvetica,
    bold: true,
    italic: true,
    label: 'Helvetica Bold Oblique',
    css: 'Helvetica, Arial, sans-serif',
  },
  {
    id: PdfStandardFont.Helvetica_Oblique,
    family: PdfStandardFontFamily.Helvetica,
    bold: false,
    italic: true,
    label: 'Helvetica Oblique',
    css: 'Helvetica, Arial, sans-serif',
  },
  {
    id: PdfStandardFont.Times_Roman,
    family: PdfStandardFontFamily.Times,
    bold: false,
    italic: false,
    label: 'Times Roman',
    css: '"Times New Roman", Times, serif',
  },
  {
    id: PdfStandardFont.Times_Bold,
    family: PdfStandardFontFamily.Times,
    bold: true,
    italic: false,
    label: 'Times Bold',
    css: '"Times New Roman", Times, serif',
  },
  {
    id: PdfStandardFont.Times_BoldItalic,
    family: PdfStandardFontFamily.Times,
    bold: true,
    italic: true,
    label: 'Times Bold Italic',
    css: '"Times New Roman", Times, serif',
  },
  {
    id: PdfStandardFont.Times_Italic,
    family: PdfStandardFontFamily.Times,
    bold: false,
    italic: true,
    label: 'Times Italic',
    css: '"Times New Roman", Times, serif',
  },
  {
    id: PdfStandardFont.Symbol,
    family: PdfStandardFontFamily.Symbol,
    bold: false,
    italic: false,
    label: 'Symbol',
    css: 'Symbol, serif',
  },
  {
    id: PdfStandardFont.ZapfDingbats,
    family: PdfStandardFontFamily.ZapfDingbats,
    bold: false,
    italic: false,
    label: 'Zapf Dingbats',
    css: 'ZapfDingbats, serif',
  },
]);

/* Fast lookup maps */
const idToDescriptor: Record<PdfStandardFont, StandardFontDescriptor> =
  STANDARD_FONT_DESCRIPTORS.reduce((m, d) => ((m[d.id] = d), m), {} as any);

const familyStyleToId = new Map<
  `${PdfStandardFontFamily}_${boolean}_${boolean}`,
  PdfStandardFont
>();
for (const d of STANDARD_FONT_DESCRIPTORS) {
  familyStyleToId.set(`${d.family}_${d.bold}_${d.italic}`, d.id);
}

function unknownDescriptor(): StandardFontDescriptor {
  return HELVETICA_DESC;
}

/* ─────────────────────────  Queries  ────────────────────────── */

/** Get the descriptor for a given enum (falls back to Unknown). */
export function getStandardFontDescriptor(font: PdfStandardFont): StandardFontDescriptor {
  return idToDescriptor[font] ?? unknownDescriptor();
}

/** Convert enum → family. */
export function standardFontFamily(font: PdfStandardFont): PdfStandardFontFamily {
  return getStandardFontDescriptor(font).family;
}

/** Is font bold? */
export function standardFontIsBold(font: PdfStandardFont): boolean {
  return getStandardFontDescriptor(font).bold;
}

/** Is font italic / oblique? */
export function standardFontIsItalic(font: PdfStandardFont): boolean {
  return getStandardFontDescriptor(font).italic;
}

/**
 * Convert **family + (bold, italic)** back to the enum.
 * Returns `undefined` when the combination doesn’t exist
 * (e.g. “Symbol + bold” is not a valid Standard-14 face).
 */
export function makeStandardFont(
  family: PdfStandardFontFamily,
  { bold, italic }: { bold: boolean; italic: boolean },
): PdfStandardFont {
  return familyStyleToId.get(`${family}_${bold}_${italic}`) ?? DEFAULT_FALLBACK_FONT;
}

/** Keep the helpers you already added: */
export function standardFontLabel(font: PdfStandardFont): string {
  return getStandardFontDescriptor(font).label;
}
export function standardFontCss(font: PdfStandardFont): string {
  return getStandardFontDescriptor(font).css;
}

/**
 * CSS properties needed to render a standard PDF font correctly across all
 * platforms.  Bold / italic are expressed via `fontWeight` and `fontStyle`
 * instead of being baked into the `fontFamily` name (e.g. "Helvetica-Bold"),
 * which doesn't exist as a system font on Windows/Linux.
 */
export interface StandardFontCssProperties {
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
}

/** Resolve a `PdfStandardFont` enum to cross-platform CSS properties. */
export function standardFontCssProperties(font: PdfStandardFont): StandardFontCssProperties {
  const desc = getStandardFontDescriptor(font);
  return {
    fontFamily: desc.css,
    fontWeight: desc.bold ? 'bold' : 'normal',
    fontStyle: desc.italic ? 'italic' : 'normal',
  };
}

/* ─────────────────────────  UI helpers  ────────────────────────── */

/** Family dropdown options (“Helvetica”, “Times”…). */
export const standardFontFamilySelectOptions = (
  Object.values(PdfStandardFontFamily) as PdfStandardFontFamily[]
)
  .filter((f) => f !== PdfStandardFontFamily.Unknown)
  .map((family) => ({ value: family, label: family }));

/**
 * Reduce multiple enums → single value or Mixed sentinel
 * (handy for multi-selection editing UIs).
 */
export function reduceStandardFonts(fonts: readonly PdfStandardFont[]): UiStandardFontValue {
  if (!fonts.length) return PdfStandardFont.Unknown;
  const first = fonts[0];
  return fonts.every((f) => f === first) ? first : MixedStandardFont;
}

/* UNIQUE families in canonical order, driven by STANDARD_FONT_DESCRIPTORS */
export const STANDARD_FONT_FAMILIES: readonly PdfStandardFontFamily[] = [
  ...new Set(STANDARD_FONT_DESCRIPTORS.map((d) => d.family)),
];

/** Friendly label for each family (could also live in the descriptor list) */
export function standardFontFamilyLabel(fam: PdfStandardFontFamily): string {
  switch (fam) {
    case PdfStandardFontFamily.Courier:
      return 'Courier';
    case PdfStandardFontFamily.Helvetica:
      return 'Helvetica';
    case PdfStandardFontFamily.Times:
      return 'Times';
    case PdfStandardFontFamily.Symbol:
      return 'Symbol';
    case PdfStandardFontFamily.ZapfDingbats:
      return 'ZapfDingbats';
    /* fallback */
    default:
      return 'Helvetica';
  }
}
