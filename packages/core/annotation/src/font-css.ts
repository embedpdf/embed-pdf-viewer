/**
 * The CSS font family the browser draws an annotation's font with, wherever
 * it draws one itself: the live text editor, a drawn text box, a redaction's
 * label. A standard font gets a web stack with its metrics; any other font is
 * a registered key, drawn in the face mounted for it.
 */
import { isStandardFontName, STANDARD_FACES } from '@embedpdf/engine-core/runtime';

type StandardFamily = (typeof STANDARD_FACES)[keyof typeof STANDARD_FACES]['family'];

/** Web stacks with the standard families' metrics. */
export const STANDARD_FONT_STACKS: Readonly<Record<StandardFamily, string>> = {
  Helvetica: 'Helvetica, Arial, sans-serif',
  Times: '"Times New Roman", Times, serif',
  Courier: '"Courier New", Courier, monospace',
  Symbol: 'serif',
  ZapfDingbats: 'serif',
};

/**
 * The family `mountWebFont` (`@embedpdf/web`) mounts a registered font's key
 * under: namespaced, so a page's own family of the same name never stands in
 * for it.
 */
export const mountedFontFamily = (key: string): string => `"epdf-${key}"`;

/** The CSS family list for a DTO font: a standard kebab name or a registered key. */
export function cssFontFamilyForFont(font: string): string {
  if (isStandardFontName(font)) return STANDARD_FONT_STACKS[STANDARD_FACES[font].family];
  return `${mountedFontFamily(font)}, sans-serif`;
}
