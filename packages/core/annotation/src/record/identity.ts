/**
 * Who a record is, read off its annotation: its engine ref, its kind, and the
 * annotations it answers. The record keeps none of these beside the
 * annotation, so every reader asks here.
 */
import type { AnnotationDTO, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { annotationKey } from '@embedpdf/core';

import type { Id, ModelAnnotation, Subtype } from '../types';

/** One PDF `widget` subtype → per-family client kinds (radios have no font). */
const WIDGET_KIND_BY_FAMILY: Record<string, string> = {
  text: 'widget-text',
  combobox: 'widget-choice',
  listbox: 'widget-choice',
  pushbutton: 'widget-button',
  checkbox: 'widget-toggle',
  radio: 'widget-toggle',
};
export const widgetKindOf = (family: string): string =>
  WIDGET_KIND_BY_FAMILY[family] ?? 'widget-box';

/** An annotation's kind: its subtype, or a widget's field family (`widget-text`…). */
export const kindOf = (annotation: AnnotationDTO): Subtype =>
  annotation.subtype === 'widget' ? widgetKindOf(annotation.fieldFamily) : annotation.subtype;

/**
 * A record's engine ref: `null` while a record this session created waits for
 * the engine, and for a record the view doesn't hold.
 */
export const refOf = (record: ModelAnnotation | undefined): AnnotationRef | null =>
  record && !record.unconfirmed ? record.annotation.ref : null;

/**
 * The key of the annotation an annotation answers (`/IRT`): a comment reply's
 * parent, or a group member's primary.
 */
export const irtOf = (annotation: AnnotationDTO): Id | undefined =>
  annotation.reply ? annotationKey(annotation.reply.to) : undefined;

/**
 * The key of the group an annotation belongs to: its primary's, for a
 * `/RT /Group` member only (a visual group acts as a unit; a comment reply
 * answers its parent but is not part of it).
 */
export const groupOf = (annotation: AnnotationDTO): Id | undefined =>
  annotation.reply?.type === 'group' ? annotationKey(annotation.reply.to) : undefined;
