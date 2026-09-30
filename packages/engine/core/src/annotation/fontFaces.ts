/**
 * Font names and faces. A free text's `fontFamily` names a face the way the
 * host does (a standard font's kebab name, a registered font's `key`); rich
 * text names it the way a PDF does (family, weight, italic). Both directions
 * map here.
 */
import type { FontIdentityInfo } from '../dto/FontSpec';
import { STANDARD_FONTS, type FreeTextFont, type StandardFont } from './primitives';

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
export function faceForFreeTextFont(font: FreeTextFont, describe?: DescribeFont): FaceRequest {
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
