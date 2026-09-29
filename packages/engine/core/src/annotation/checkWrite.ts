import type { z } from 'zod';

import { semanticEqual } from './appearance';
import { ColorSchema } from './base.schema';
import { sameColor } from './color';
import {
  declarationOf,
  FileAnnotationDraftSchema,
  fileAnnotationPatchSchemaOf,
  KIND_BY_SUBTYPE,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationPatch,
} from './kinds';
import type { KindFields } from './declaration';
import { DRAWN_RECT_KINDS, pdfShapeForRect, shapeFieldsOf } from './shapeForRect';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { normalizePdfRect } from '../geometry/convert';
import { PdfRectSchema } from '../geometry/schemas';
import type { PdfCoordinates } from '../pageSpace/coordinates';

/**
 * The checks every annotation write runs before its first write, on both
 * engines: the values against their kind's schema, not only the names. A
 * value the schema refuses is `InvalidArg` naming the field. The caller
 * writes its own data, not the schema's output, so nothing is reshaped on
 * its way in.
 */
export function assertAnnotationDraft(
  draft: AnnotationDraft<PdfCoordinates>,
  options: {
    /**
     * Link fields the caller has taken out of the draft and links itself (a
     * change set's `reply` and popup `parent`); they aren't checked here.
     */
    linked?: readonly string[];
  } = {},
): void {
  const declaration = declarationOf(String(draft.subtype));
  const linked = options.linked ?? [];
  const schema =
    declaration && linked.length > 0
      ? (declaration.fileSchemas.create as unknown as z.AnyZodObject).omit(
          Object.fromEntries(linked.map((name) => [name, true])),
        )
      : FileAnnotationDraftSchema;
  const checked = schema.safeParse(draft);
  if (!checked.success) throw invalidWrite(checked.error, `${String(draft.subtype)} create`);
}

/**
 * The patch to write for `current`: a `readBack()` value sent back
 * unchanged is dropped (the annotation keeps it), a changed one is refused,
 * and the rest is checked against the kind's update schema. A color sent
 * back as it reads is dropped too, so the file keeps it as it has it. A drawn
 * kind's `rect` (one the engine works out) puts the shape there
 * (`pdfShapeForRect`).
 */
export function checkAnnotationPatch(
  current: AnnotationDTO<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (current.subtype === 'unsupported') return patch;
  const readBackWrites = KIND_BY_SUBTYPE[current.subtype].readBackWrites;
  let checked = withoutUnchangedColors(current, putShapeAtRect(current, patch));
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
    checked = rest as AnnotationPatch<PdfCoordinates>;
  }
  const parsed = fileAnnotationPatchSchemaOf(current.subtype).safeParse(checked);
  if (!parsed.success) throw invalidWrite(parsed.error, `${current.subtype} update`);
  return checked;
}

/**
 * The patch without the colors it sends back as they read. A gray or CMYK
 * color in the file reads as its sRGB equivalent; writing that back would
 * store it as sRGB, so leaving it out keeps the file as it is.
 */
function withoutUnchangedColors(
  current: AnnotationDTO<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  const fields: KindFields = declarationOf(current.subtype)?.fields ?? {};
  const read = current as unknown as Record<string, unknown>;
  let kept = patch as Record<string, unknown>;
  for (const [name, spec] of Object.entries(fields)) {
    const value = kept[name];
    const was = read[name];
    if (spec.read !== ColorSchema || typeof value !== 'string' || typeof was !== 'string') continue;
    if (!sameColor(value, was)) continue;
    const { [name]: _unchanged, ...rest } = kept;
    kept = rest;
  }
  return kept as AnnotationPatch<PdfCoordinates>;
}

/**
 * A drawn kind's `rect` other than the one it read, as the shape fields that
 * put the drawing there. It can't come with a change to the shape itself:
 * which of the two to follow would be a guess.
 */
function putShapeAtRect(
  current: AnnotationDTO<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  const { rect, ...rest } = patch as AnnotationPatch<PdfCoordinates> & { rect?: unknown };
  if (rect === undefined || !DRAWN_RECT_KINDS.has(current.subtype)) return patch;
  const parsed = PdfRectSchema.safeParse(rect);
  if (!parsed.success) throw invalidWrite(parsed.error, `${current.subtype} update`, 'rect');
  // The rect it read, sent back: nothing moves.
  if (semanticEqual(normalizePdfRect(parsed.data), current.rect))
    return rest as AnnotationPatch<PdfCoordinates>;
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
  return { ...rest, ...pdfShapeForRect(current, parsed.data) } as AnnotationPatch<PdfCoordinates>;
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
