/**
 * An annotation's style: how it is drawn, worked out by its kind from the
 * annotation's own fields (`kinds/styles.ts`).
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';

import type { Style } from '../types';
import { kindOf } from './identity';

const styles = new WeakMap<Annotation, Style>();

/**
 * How the annotation is drawn: its colours, stroke and border, by the
 * engine's names, with its kind's fill-ins. A view: nothing is written back
 * through it. The same style for the same annotation.
 */
export function styleOf(annotation: Annotation): Style {
  let style = styles.get(annotation);
  if (!style) {
    style = kindOf(annotation).style(annotation);
    styles.set(annotation, style);
  }
  return style;
}
