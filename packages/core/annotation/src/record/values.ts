/**
 * Writing engine fields to a record: the one door every edit that states
 * engine fields goes through — a sidebar restyle, a flag, a link target, a
 * text format, a measurement's leader.
 */
import {
  ANNOTATION_FIELD_NAMES,
  annotationPatchBetween,
  canChangeKind,
  mergeAnnotationPatch,
  resolveRectCommand,
  type AnnotationPatch,
  type AnnotationSubtype,
} from '@embedpdf/engine-core/runtime';

import { mayWrite } from '../flags';
import type { FieldValues, ModelAnnotation } from '../types';

/**
 * The kind a write leaves the record: the sibling kind `values` names when
 * this session may change the record now and the annotation can become it
 * (`canChangeKind`), else its own.
 */
function kindAfter(record: ModelAnnotation, values: FieldValues): AnnotationSubtype {
  const own = record.annotation.subtype;
  const named = values.subtype;
  if (typeof named !== 'string' || named === own) return own;
  return mayWrite(record, 'subtype') && canChangeKind(record.annotation, named)
    ? (named as AnnotationSubtype)
    : own;
}

/**
 * The record with engine `values` written, as far as it takes them:
 *
 * 1. Its kind: a sibling kind `values` names, when it can become it now
 *    (`kindAfter`), and its own otherwise.
 * 2. Only the fields that kind has and this session may change now
 *    (`mayWrite`). The rest are ignored, so one set of values restyles a
 *    mixed selection.
 * 3. A `rect` is a command, resolved as the engine resolves it
 *    (`resolveRectCommand`): it becomes the shape that puts the drawing
 *    there, and one the engine would refuse throws.
 * 4. Merged into its annotation as given. The engine's follow rules (a
 *    measurement's label, a callout's end) run once, where the change is
 *    applied (`applyChange`).
 *
 * A value set to what it was is no change: the same record comes back.
 */
export function withValues(record: ModelAnnotation, values: FieldValues): ModelAnnotation {
  const subtype = kindAfter(record, values);
  const declared = ANNOTATION_FIELD_NAMES[subtype];
  const taken: Record<string, unknown> = subtype === record.annotation.subtype ? {} : { subtype };
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined || field === 'subtype' || !declared.includes(field)) continue;
    if (mayWrite(record, field)) taken[field] = value;
  }
  if (!Object.keys(taken).length) return record;
  const stated = resolveRectCommand(record.annotation, {
    ...taken,
    subtype,
  } as AnnotationPatch);
  const annotation = mergeAnnotationPatch(record.annotation, stated);
  return Object.keys(annotationPatchBetween(record.annotation, annotation)).length
    ? { ...record, annotation }
    : record;
}
