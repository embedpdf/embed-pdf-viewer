/**
 * A standard face as CSS: its program's family first, then the platform's
 * look-alikes for the moment before the program is mounted. What a viewer
 * draws a font in when it has no fonts plugin to ask: the standard font the
 * engine falls back to for it.
 */
import {
  STANDARD_FACES,
  STANDARD_FONTS,
  fontNameForFace,
  isStandardFontName,
  standardFamilyOf,
  type FaceRequest,
  type FontName,
  type StandardFont,
} from '@embedpdf/engine-core/runtime';

import { fontProgramFamily, standardFontProgram, type MountableFontProgram } from './programs';
import { FACES } from './faces.generated';

const STACKS: Readonly<Record<(typeof STANDARD_FACES)[StandardFont]['family'], string>> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
  Symbol: 'Symbol, serif',
  ZapfDingbats: '"Zapf Dingbats", ZapfDingbats, serif',
};

export interface StandardFontCss {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontStyle: 'normal' | 'italic';
  /** The program `fontFamily` names first: whatever draws the text mounts it. */
  readonly programs: readonly MountableFontProgram[];
}

/** The platform's look-alikes of a standard face, as a CSS family list. */
export function standardFontStack(font: StandardFont): string {
  return STACKS[STANDARD_FACES[font].family];
}

const css = new Map<StandardFont, StandardFontCss>();

/** The same object for the same font. */
export function standardFontCss(font: StandardFont): StandardFontCss {
  let known = css.get(font);
  if (!known) {
    const program = standardFontProgram(font);
    known = {
      fontFamily: `"${program.family}", ${standardFontStack(font)}`,
      fontWeight: program.weight,
      fontStyle: program.style,
      programs: [program],
    };
    css.set(font, known);
  }
  return known;
}

/** The standard font a box's font is drawn in without its program: itself, else Helvetica. */
export function standardFontOf(font: FontName): StandardFont {
  return isStandardFontName(font) ? font : 'helvetica';
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

let byProgramFamily: Map<string, StandardFont> | null = null;

/** The standard font whose built-in program a CSS family names ({@link fontProgramFamily}). */
export function standardFontOfProgramFamily(cssFamily: string): StandardFont | undefined {
  byProgramFamily ??= new Map(
    STANDARD_FONTS.map((font) => [fontProgramFamily(FACES[font].programHash), font]),
  );
  return byProgramFamily.get(cssFamily);
}
