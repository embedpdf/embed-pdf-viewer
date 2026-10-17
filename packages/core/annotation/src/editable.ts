/**
 * What people may change by hand: the session's `editable` rule, plain data
 * the plugin sets from its settings. It joins the `/F` flags and the record's
 * authority (flags.ts) in every gesture gate and every edit of the selection,
 * and nowhere else: a change stated in code never asks it, and neither do the
 * `can*` twins, which stay facts. An annotation the rule freezes can still be
 * selected, hovered, read and commented on; it has no handles, no knob, no
 * drag, no text editing, and the selection's edits and delete skip it.
 */
import {
  isDimension,
  type Annotation,
  type AnnotationSubtype,
} from '@embedpdf/engine-core/runtime';

import { annotContentsEditable, annotDeletable, annotTransformable } from './flags';
import type { ModelAnnotation, Session } from './types';

/** The intents a measurement goes by in {@link EditableKinds}. */
export type MeasurementIntent = 'line-dimension' | 'polyline-dimension' | 'polygon-dimension';

/** What {@link EditableKinds} names an annotation by: {@link editableKindOf}. */
export type EditableKind = AnnotationSubtype | MeasurementIntent;

/**
 * Which annotations people may change by hand: `true`, every one; `false`,
 * none; a list, the annotations of the kinds it names, each by its subtype,
 * or a measurement by its intent (so measurements and the shapes they're
 * drawn as are told apart).
 */
export type EditableKinds = boolean | readonly EditableKind[];

/** The name {@link EditableKinds} knows an annotation by: a measurement's intent, else its subtype. */
export function editableKindOf(annotation: Annotation): EditableKind {
  const { intent } = annotation as { readonly intent?: string | null };
  return isDimension(annotation) ? (intent as MeasurementIntent) : annotation.subtype;
}

/** Whether the session's rule lets people change this annotation by hand. */
export function isEditableByHand(
  model: Pick<Session, 'editable'>,
  annotation: Annotation,
): boolean {
  const { editable } = model;
  return typeof editable === 'boolean' ? editable : editable.includes(editableKindOf(annotation));
}

/** Whether people may move, resize, turn, reshape or restyle the record by hand now. */
export const isTransformableByHand = (
  model: Pick<Session, 'editable'>,
  record: ModelAnnotation,
): boolean => annotTransformable(record) && isEditableByHand(model, record.annotation);

/** Whether people may delete the record by hand now. */
export const isDeletableByHand = (
  model: Pick<Session, 'editable'>,
  record: ModelAnnotation,
): boolean => annotDeletable(record) && isEditableByHand(model, record.annotation);

/** Whether people may edit the record's text in place now. */
export const isContentsEditableByHand = (
  model: Pick<Session, 'editable'>,
  record: ModelAnnotation,
): boolean => annotContentsEditable(record) && isEditableByHand(model, record.annotation);
