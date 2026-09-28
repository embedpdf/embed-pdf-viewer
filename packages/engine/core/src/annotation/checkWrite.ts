import type { z } from 'zod';

import { semanticEqual } from './appearance';
import type { AnnotationDTO } from './kinds';
import { AnnotationDraftSchema, annotationPatchSchemaOf, KIND_BY_SUBTYPE } from './kinds';
import type { AnnotationDraft, AnnotationPatch } from './kinds';
import { DRAWN_RECT_KINDS, shapeFieldsOf, shapeForRect } from './shapeForRect';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { normalizePdfRect } from '../geometry/convert';
import { PdfRectSchema } from '../geometry/schemas';

/**
 * The checks every annotation write runs before its first write, on both
 * engines: the values against their kind's schema, not only the names. A
 * value the schema refuses is `InvalidArg` naming the field. The caller
 * writes its own data, not the schema's output, so nothing is reshaped on
 * its way in.
 */
export function assertAnnotationDraft(
  draft: AnnotationDraft,
  options: {
    /**
     * Link fields the caller has taken out of the draft and links itself (a
     * change set's `reply` and popup `parent`); they aren't checked here.
     */
    linked?: readonly string[];
  } = {},
): void {
  const kind = KIND_BY_SUBTYPE[draft.subtype as keyof typeof KIND_BY_SUBTYPE];
  const linked = options.linked ?? [];
  const schema =
    kind && linked.length > 0
      ? (kind.draftSchema as unknown as z.AnyZodObject).omit(
          Object.fromEntries(linked.map((name) => [name, true])),
        )
      : AnnotationDraftSchema;
  const checked = schema.safeParse(draft);
  if (!checked.success) throw invalidWrite(checked.error, `${String(draft.subtype)} create`);
}

/**
 * The patch to write for `current`: a `readBack()` value sent back
 * unchanged is dropped (the annotation keeps it), a changed one is refused,
 * and the rest is checked against the kind's update schema. A drawn kind's
 * `rect` (one the engine works out) puts the shape there (`shapeForRect`).
 */
export function checkAnnotationPatch(
  current: AnnotationDTO,
  patch: AnnotationPatch,
): AnnotationPatch {
  if (current.subtype === 'unsupported') return patch;
  const readBackWrites = KIND_BY_SUBTYPE[current.subtype].readBackWrites;
  let checked = putShapeAtRect(current, patch);
  for (const [name, write] of Object.entries(readBackWrites)) {
    const value = (checked as Record<string, unknown>)[name];
    if (value === undefined || write?.safeParse(value).success) continue;
    if (!semanticEqual(value, (current as unknown as Record<string, unknown>)[name])) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        write
          ? `${current.subtype} update field '${name}': this value can be read but not written; send it back unchanged or replace it`
          : `${current.subtype} update field '${name}': the engine works this out; send it back unchanged or leave it out`,
        { details: { field: name } },
      );
    }
    const { [name]: _kept, ...rest } = checked as Record<string, unknown>;
    checked = rest as AnnotationPatch;
  }
  const parsed = annotationPatchSchemaOf(current.subtype).safeParse(checked);
  if (!parsed.success) throw invalidWrite(parsed.error, `${current.subtype} update`);
  return checked;
}

/**
 * A drawn kind's `rect` other than the one it read, as the shape fields that
 * put the drawing there. It can't come with a change to the shape itself:
 * which of the two to follow would be a guess.
 */
function putShapeAtRect(current: AnnotationDTO, patch: AnnotationPatch): AnnotationPatch {
  const { rect, ...rest } = patch as AnnotationPatch & { rect?: unknown };
  if (rect === undefined || !DRAWN_RECT_KINDS.has(current.subtype)) return patch;
  const parsed = PdfRectSchema.safeParse(rect);
  if (!parsed.success) throw invalidWrite(parsed.error, `${current.subtype} update`, 'rect');
  // The rect it read, sent back: nothing moves.
  if (semanticEqual(normalizePdfRect(parsed.data), current.rect)) return rest as AnnotationPatch;
  const read = current as unknown as Record<string, unknown>;
  const changed = shapeFieldsOf(current.subtype).find((name) => {
    const value = (patch as unknown as Record<string, unknown>)[name];
    return value !== undefined && !semanticEqual(value, read[name]);
  });
  if (changed) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${current.subtype} update field 'rect': a new rect moves the shape, so it can't come with a new '${changed}'`,
      { details: { field: 'rect' } },
    );
  }
  return { ...rest, ...shapeForRect(current, parsed.data) } as AnnotationPatch;
}

function invalidWrite(error: z.ZodError, where: string, parent?: string): EngineError {
  const issue = error.issues[0]!;
  const field = [...(parent ? [parent] : []), ...issue.path].join('.');
  return new EngineError(
    EngineErrorCode.InvalidArg,
    `${where}${field ? ` field '${field}'` : ''}: ${issue.message}`,
    { details: field ? { field } : {} },
  );
}
