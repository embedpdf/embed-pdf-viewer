/**
 * Font names and faces. A free text's or a widget's `fontFamily` names a
 * face the way the host does (a standard font's kebab name, a registered
 * font's `key`, or a family the document has); rich text and the engine name
 * it the way a PDF does (family, weight, italic). Both directions map here.
 */
import { STANDARD_FONTS, type FontName, type StandardFont } from './primitives';
import type { FontIdentityInfo } from '../dto/FontSpec';

/** The face a font name asks for; weight and italic when the name implies them. */
export interface FaceRequest {
  family: string;
  weight?: number;
  italic?: boolean;
}

interface StandardFace {
  family: 'Helvetica' | 'Times' | 'Courier' | 'Symbol' | 'ZapfDingbats';
  weight: number;
  italic: boolean;
}

/** Looks up a registered font by its key: what `engine.fonts` knows about it. */
export type DescribeFont = (fontKey: string) => FontIdentityInfo | undefined;

export const STANDARD_FACES: Readonly<Record<StandardFont, StandardFace>> = {
  courier: { family: 'Courier', weight: 400, italic: false },
  'courier-bold': { family: 'Courier', weight: 700, italic: false },
  'courier-bold-oblique': { family: 'Courier', weight: 700, italic: true },
  'courier-oblique': { family: 'Courier', weight: 400, italic: true },
  helvetica: { family: 'Helvetica', weight: 400, italic: false },
  'helvetica-bold': { family: 'Helvetica', weight: 700, italic: false },
  'helvetica-bold-oblique': { family: 'Helvetica', weight: 700, italic: true },
  'helvetica-oblique': { family: 'Helvetica', weight: 400, italic: true },
  'times-roman': { family: 'Times', weight: 400, italic: false },
  'times-bold': { family: 'Times', weight: 700, italic: false },
  'times-bold-italic': { family: 'Times', weight: 700, italic: true },
  'times-italic': { family: 'Times', weight: 400, italic: true },
  symbol: { family: 'Symbol', weight: 400, italic: false },
  'zapf-dingbats': { family: 'ZapfDingbats', weight: 400, italic: false },
};

/** One of the 14 standard names. The names are reserved: a registered font keyed `'helvetica'` resolves as the standard one. */
export const isStandardFontName = (font: string): font is StandardFont =>
  (STANDARD_FONTS as readonly string[]).includes(font);

/**
 * The face a free text's `fontFamily` (or a rich run's `family`) asks for: a
 * standard font's family, weight and italic; a registered key's identity; or,
 * for anything else, the string itself as a family name (a face the document
 * embeds, or one the engine will substitute).
 */
export function faceForFontName(font: FontName, describe?: DescribeFont): FaceRequest {
  if (isStandardFontName(font)) {
    const face = STANDARD_FACES[font];
    return { family: face.family, weight: face.weight, italic: face.italic };
  }
  const registered = describe?.(font);
  if (registered) {
    return { family: registered.familyName, weight: registered.weight, italic: registered.italic };
  }
  return { family: font };
}

/** Family names compare without case, spaces, hyphens and underscores
 *  (the engine's own rule): "Noto Sans" == "NotoSans" == "noto-sans". */
export function familyKey(family: string): string {
  return family.toLowerCase().replace(/[\s\-_'"]/g, '');
}

/** Families that are a standard font's, by `familyKey`. */
const STANDARD_FAMILY_KEYS: Record<string, StandardFace['family']> = {
  helvetica: 'Helvetica',
  arial: 'Helvetica',
  arialmt: 'Helvetica',
  sansserif: 'Helvetica',
  times: 'Times',
  timesroman: 'Times',
  timesnewroman: 'Times',
  timesnewromanpsmt: 'Times',
  serif: 'Times',
  courier: 'Courier',
  couriernew: 'Courier',
  couriernewpsmt: 'Courier',
  monospace: 'Courier',
  symbol: 'Symbol',
  zapfdingbats: 'ZapfDingbats',
  dingbats: 'ZapfDingbats',
};

/** The standard family a family name stands for ("Arial" is Helvetica), or undefined. */
export function standardFamilyOf(family: string): StandardFace['family'] | undefined {
  return STANDARD_FAMILY_KEYS[familyKey(family)];
}

/** Looks up the registered font a face is: its `key`, or undefined. */
export type KeyForFace = (family: string, weight: number, italic: boolean) => string | undefined;

/**
 * The `fontFamily` that names a face (the other direction of
 * {@link faceForFontName}): the registered `key` whose identity matches,
 * else the standard font's kebab name, else the family itself.
 */
export function fontNameForFace(
  face: { family: string; weight: number; italic: boolean },
  keyForFace?: KeyForFace,
): FontName {
  const key = keyForFace?.(face.family, face.weight, face.italic);
  if (key !== undefined) return key;
  const standard = STANDARD_FAMILY_KEYS[familyKey(face.family)];
  if (standard) {
    const faces = Object.entries(STANDARD_FACES) as [StandardFont, StandardFace][];
    const bold = face.weight >= 600;
    const exact = faces.find(
      ([, spec]) =>
        spec.family === standard && spec.weight >= 600 === bold && spec.italic === face.italic,
    );
    // Symbol and ZapfDingbats have no bold or italic faces.
    const any = exact ?? faces.find(([, spec]) => spec.family === standard);
    if (any) return any[0];
  }
  return face.family;
}
