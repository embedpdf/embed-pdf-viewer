/**
 * The fonts plugin's pure parts: which font of the list a name or a face is,
 * and the CSS family list text is drawn with.
 */
import { reload, type DocumentEvent, type MirrorReload } from '@embedpdf/core';
import {
  familyKey,
  fontNameForFace,
  isStandardFontName,
  standardFamilyOf,
  type FaceRequest,
  type Font,
  type FontList,
  type FontName,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';

/** Apply one confirmed event to the list: a change of the document's fonts reads it again. */
export const foldFontList = (
  list: FontList | null,
  event: DocumentEvent,
): FontList | null | MirrorReload => (event.type === 'fonts.changed' ? reload() : list);

/** The font a box's `fontFamily` names. */
export const fontNamed = (list: FontList, name: FontName): Font | undefined =>
  list.fonts.find((font) => font.name === name);

/**
 * The engine's or the document's font of a face's family with the closest
 * weight and italic, the engine's first when they tie: a font registered as
 * "Arial" is that font, never the standard Helvetica.
 */
export function fontForFace(list: FontList, face: FaceRequest): Font | undefined {
  const wanted = familyKey(face.family);
  const weight = face.weight ?? 400;
  const italic = face.italic ?? false;
  let best: { font: Font; score: number } | undefined;
  for (const font of list.fonts) {
    if (font.source === 'standard' || familyKey(font.familyName) !== wanted) continue;
    const score =
      Math.abs(font.weight - weight) +
      (font.italic === italic ? 0 : 1000) +
      (font.source === 'engine' ? 0 : 0.5);
    if (!best || score < best.score) best = { font, score };
  }
  return best?.font;
}

/**
 * The standard font the engine draws a face in when no other font is that
 * face: its own standard family's (Arial is Helvetica), else Helvetica, in the
 * face's weight and italic.
 */
export function standardFontForFace(face: FaceRequest): StandardFont {
  const name = fontNameForFace({
    family: standardFamilyOf(face.family) ?? 'Helvetica',
    weight: face.weight ?? 400,
    italic: face.italic ?? false,
  });
  return isStandardFontName(name) ? name : 'helvetica';
}

/** The weight and italic of the font a program belongs to; regular when no listed font has it. */
export function styleOfProgram(
  list: FontList | null,
  displayHash: string,
): { weight: number; italic: boolean } {
  const font = list?.fonts.find((candidate) =>
    candidate.programs.some((program) => program.displayHash === displayHash),
  );
  return font ? { weight: font.weight, italic: font.italic } : { weight: 400, italic: false };
}

/** The display hashes of the list's fallbacks, in its order. */
export function fallbackHashes(list: FontList | null): string[] {
  if (!list) return [];
  const hashes: string[] = [];
  for (const name of list.fallbacks) {
    const hash = fontNamed(list, name)?.programs[0]?.displayHash;
    if (hash) hashes.push(hash);
  }
  return hashes;
}

/** A CSS `font-family` list: each family quoted, in order, then `tail` as it is. */
export function cssFamilyList(families: readonly string[], tail: string): string {
  return [...families.map((family) => `"${family}"`), tail].join(', ');
}
