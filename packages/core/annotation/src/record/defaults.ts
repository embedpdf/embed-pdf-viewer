/**
 * A tool's defaults, read as an annotation: the tool's engine fields laid
 * over the engine's own defaults for its kind. A form tool's defaults also
 * read as the engine's widget appearance.
 */
import {
  annotationDefaultsOf,
  type Annotation,
  type AnnotationSubtype,
  type WidgetAppearance,
} from '@embedpdf/engine-core/runtime';

import { fieldFamilyOfKind } from '../kinds';
import type { FieldValues } from '../types';

/** The engine subtype a client kind creates: a callout is a free text, a form tool's kind a widget. */
export const engineSubtypeOf = (kind: string): AnnotationSubtype =>
  kind === 'free-text-callout'
    ? 'free-text'
    : kind.startsWith('widget')
      ? 'widget'
      : (kind as AnnotationSubtype);

/**
 * A tool's `defaults` over the engine's defaults for `kind`: what a create
 * from the tool starts from. A form tool's reads as a widget of its field
 * family, so it reads as the tool's own kind (a radio tool's is round).
 */
export function readOfDefaults(kind: string, defaults: FieldValues): Annotation {
  const subtype = engineSubtypeOf(kind);
  const fieldFamily = subtype === 'widget' ? fieldFamilyOfKind(kind) : undefined;
  return {
    subtype,
    ...annotationDefaultsOf(subtype),
    ...(fieldFamily ? { fieldFamily } : {}),
    ...defaults,
  } as unknown as Annotation;
}

const WIDGET_APPEARANCE_FIELDS = [
  'color',
  'interiorColor',
  'strokeWidth',
  'borderStyle',
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
] as const;

/**
 * A form tool's defaults as the engine's widget appearance for `doc.forms`
 * authoring: the widget's style fields among them, as they are. Absent fields
 * stay absent (the engine writes nothing for them).
 */
export function widgetAppearanceOf(defaults: FieldValues): WidgetAppearance {
  return Object.fromEntries(
    WIDGET_APPEARANCE_FIELDS.filter((name) => defaults[name] !== undefined).map((name) => [
      name,
      defaults[name],
    ]),
  ) as WidgetAppearance;
}
