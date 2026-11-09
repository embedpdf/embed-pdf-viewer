import type { Color } from '../annotation/primitives';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/** Page colors with a name. `'normal'` draws the page as the file has it. */
export type PageColorsPreset = 'normal' | 'dark' | 'sepia';

/**
 * Page colors you choose yourself. Every field is optional: a color left out
 * is {@link CustomPageColors.text}, which is black when left out too, and the
 * paper is white.
 */
export interface CustomPageColors {
  /** The paper: what the picture is filled with before the page is drawn. Default `'#ffffff'`. */
  background?: Color;
  /** The color of text and shapes that the four below take when left out. Default `'#000000'`. */
  text?: Color;
  /** The fill of shapes: a chart's bars, a box's background. */
  pathFill?: Color;
  /** The outline of shapes, and lines. */
  pathStroke?: Color;
  /** The fill of text. */
  textFill?: Color;
  /** The outline of text, where the font has one. */
  textStroke?: Color;
  /**
   * Draw filled shapes as outlines, so a shape does not cover the text on it:
   * with one color for every fill, a text label on a filled box would be the
   * color of the box. Default `false`.
   */
  convertFillToStroke?: boolean;
}

/**
 * The colors a page is drawn in: a preset, or {@link CustomPageColors}.
 * Text and shapes take one color each, and pictures, scans and shadings are
 * drawn as the file has them.
 */
export type PageColors = PageColorsPreset | CustomPageColors;

/** Page colors a renderer draws with: every color named. */
export interface PageColorScheme {
  readonly background: Color;
  readonly pathFill: Color;
  readonly pathStroke: Color;
  readonly textFill: Color;
  readonly textStroke: Color;
  readonly convertFillToStroke: boolean;
}

const SCHEME_FIELDS: readonly (keyof CustomPageColors)[] = [
  'background',
  'text',
  'pathFill',
  'pathStroke',
  'textFill',
  'textStroke',
  'convertFillToStroke',
];

const DARK: PageColorScheme = {
  background: '#1e1e1e',
  pathFill: '#e8e6e3',
  pathStroke: '#e8e6e3',
  textFill: '#e8e6e3',
  textStroke: '#e8e6e3',
  convertFillToStroke: true,
};

const SEPIA: PageColorScheme = {
  background: '#f4ecd8',
  pathFill: '#5b4636',
  pathStroke: '#5b4636',
  textFill: '#5b4636',
  textStroke: '#5b4636',
  convertFillToStroke: true,
};

function invalid(field: string, message: string): never {
  throw new EngineError(EngineErrorCode.InvalidArg, message, { details: { field } });
}

function checkedColor(value: unknown, field: string, fallback: Color): Color {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    invalid(`pageColors.${field}`, `pageColors.${field} must be a color as '#rrggbb'`);
  }
  return value.toLowerCase();
}

/**
 * The colors a page is drawn in for `pageColors`, or `null` for the page as
 * the file has it (left out, or `'normal'`). Anything that is not a preset
 * or an object of `'#rrggbb'` colors and `convertFillToStroke` is
 * `InvalidArg`, naming the field.
 */
export function resolvePageColors(pageColors: PageColors | undefined): PageColorScheme | null {
  if (pageColors === undefined || pageColors === 'normal') return null;
  if (pageColors === 'dark') return DARK;
  if (pageColors === 'sepia') return SEPIA;
  if (typeof pageColors !== 'object' || pageColors === null || Array.isArray(pageColors)) {
    invalid('pageColors', "pageColors must be 'normal', 'dark', 'sepia' or an object of colors");
  }
  for (const key of Object.keys(pageColors)) {
    if (!SCHEME_FIELDS.includes(key as keyof CustomPageColors)) {
      invalid(`pageColors.${key}`, `pageColors has no ${key}`);
    }
  }
  const { convertFillToStroke } = pageColors;
  if (convertFillToStroke !== undefined && typeof convertFillToStroke !== 'boolean') {
    invalid('pageColors.convertFillToStroke', 'pageColors.convertFillToStroke must be a boolean');
  }
  const text = checkedColor(pageColors.text, 'text', '#000000');
  return {
    background: checkedColor(pageColors.background, 'background', '#ffffff'),
    pathFill: checkedColor(pageColors.pathFill, 'pathFill', text),
    pathStroke: checkedColor(pageColors.pathStroke, 'pathStroke', text),
    textFill: checkedColor(pageColors.textFill, 'textFill', text),
    textStroke: checkedColor(pageColors.textStroke, 'textStroke', text),
    convertFillToStroke: convertFillToStroke ?? false,
  };
}
