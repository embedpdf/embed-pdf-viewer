/**
 * Who a record is, read off its annotation: its engine ref, its kind, and the
 * annotations it answers. The record keeps none of these beside the
 * annotation, so every reader asks here.
 */
import type { AnnotationDTO, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { annotationKey } from '@embedpdf/core';

import { kindNamed, widgetKindOf, type AnnotationKind } from '../kinds';
import type { Id, ModelAnnotation } from '../types';

/**
 * An annotation's kind (`kinds/`): the one its subtype names; for a widget,
 * the one its field family picks (`widget-text`…); for a free text with the
 * callout intent, the callout.
 */
export function kindOf(annotation: AnnotationDTO): AnnotationKind {
  switch (annotation.subtype) {
    case 'widget':
      return kindNamed(widgetKindOf(annotation.fieldFamily));
    case 'free-text':
      return kindNamed(
        annotation.intent === 'free-text-callout' ? 'free-text-callout' : 'free-text',
      );
    default:
      return kindNamed(annotation.subtype);
  }
}

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
