/**
 * Writing engine fields to a record: the one door every edit that states
 * engine fields goes through — a sidebar restyle, a flag, a link target, a
 * text format, a measurement's leader.
 */
import {
  ANNOTATION_FIELD_NAMES,
  annotationPatchBetween,
  mergeAnnotationPatch,
  resolveRectCommand,
  type AnnotationPatch,
} from '@embedpdf/engine-core/runtime';

import { mayWrite } from '../flags';
import type { FieldValues, ModelAnnotation } from '../types';

/**
 * The record with engine `values` written, as far as it takes them:
 *
 * 1. Only the fields its kind has and this session may change now
 *    (`mayWrite`). The rest are ignored, so one set of values restyles a
 *    mixed selection.
 * 2. A `rect` is a command, resolved as the engine resolves it
 *    (`resolveRectCommand`): it becomes the shape that puts the drawing
 *    there, and one the engine would refuse throws.
 * 3. Merged into its annotation as given. The engine's follow rules (a
 *    measurement's label, a callout's end) run once, where the change is
 *    applied (`applyChange`).
 *
 * A value set to what it was is no change: the same record comes back.
 */
export function withValues(record: ModelAnnotation, values: FieldValues): ModelAnnotation {
  const declared = ANNOTATION_FIELD_NAMES[record.annotation.subtype];
  const taken: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined || field === 'subtype' || !declared.includes(field)) continue;
    if (mayWrite(record, field)) taken[field] = value;
  }
  if (!Object.keys(taken).length) return record;
  const stated = resolveRectCommand(record.annotation, {
    ...taken,
    subtype: record.annotation.subtype,
  } as AnnotationPatch);
  const annotation = mergeAnnotationPatch(record.annotation, stated);
  return Object.keys(annotationPatchBetween(record.annotation, annotation)).length
    ? { ...record, annotation }
    : record;
}
