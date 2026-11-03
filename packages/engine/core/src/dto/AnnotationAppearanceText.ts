import type { AnnotationRef } from '../identity/AnnotationRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * The text an annotation's normal appearance shows
 * (`page.annotations.readAppearanceText()`, local engines): what a viewer
 * needs to lay an editor's text exactly where the appearance draws it.
 */
export interface AnnotationAppearanceText<C extends Coordinates = PageCoordinates> {
  ref: AnnotationRef;
  /** The lines, top to bottom, trailing spaces trimmed; empty when it shows no text. */
  lines: string[];
  /** Where the first glyph drawn sits on the page: its origin, on the baseline. */
  firstOrigin: C['point'] | null;
}
