/**
 * An annotation's text: how it is set, worked out by its kind from the
 * annotation's own fields (`kinds/texts.ts`), for the kinds that have text.
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';

import type { TextStyle } from '../types';
import { kindOf } from './identity';

const texts = new WeakMap<Annotation, TextStyle | undefined>();

/**
 * How the annotation's text is set: its font, size, colour and alignment by
 * the engine's names, and a free text's bold, italic and underline. A view:
 * nothing is written back through it. `undefined` for a kind without text.
 * The same value for the same annotation.
 */
export function textOf(annotation: Annotation): TextStyle | undefined {
  if (texts.has(annotation)) return texts.get(annotation);
  const text = kindOf(annotation).text?.(annotation);
  texts.set(annotation, text);
  return text;
}
