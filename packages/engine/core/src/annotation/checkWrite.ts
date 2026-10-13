/**
 * The checks every annotation write runs before its first write, on both
 * engines: the prepared values against their kind's schema, not only the
 * names. A value the schema refuses is `InvalidArg` naming the field. A check
 * only accepts or refuses: it never adds, drops or changes a field, so the
 * engine writes what a viewer predicts (prepare, check, derive; the viewer
 * runs the same two steps without schema validation, `resolve/`). Built with
 * zod, so it runs where the engine does (its worker, the server), never on
 * the page: `@embedpdf/engine-core/validation` exports it.
 */
import type { z } from 'zod';

import {
  declarationOf,
  FileAnnotationDraftSchema,
  fileAnnotationPatchSchemaOf,
  KIND_BY_SUBTYPE,
  type AnnotationDraft,
  type Annotation,
  type AnnotationPatch,
} from './kinds';
import {
  pdfDeriveAnnotationDraft,
  pdfPrepareAnnotationDraft,
  type DraftResolveOptions,
} from './resolve/resolveAnnotationDraft';
import {
  pdfDeriveAnnotationPatch,
  pdfPrepareAnnotationPatch,
  type ResolveOptions,
} from './resolve/resolveAnnotationPatch';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PdfCoordinates } from '../pageSpace/coordinates';

/**
 * A prepared create's data checked against its kind's schema. The caller
 * writes its own data, not the schema's output, so nothing is reshaped on its
 * way in.
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
 * A prepared update's data (`pdfPrepareAnnotationPatch`) checked against the
 * kind of `current`. A `readBack()` value still in it is a change, as
 * preparation drops one sent back as it reads, so one a write can't make is
 * refused; the rest is checked against the kind's update schema.
 */
export function assertAnnotationPatch(
  current: Annotation<PdfCoordinates>,
  prepared: AnnotationPatch<PdfCoordinates>,
): void {
  if (current.subtype === 'unsupported') return;
  const values = prepared as Record<string, unknown>;
  for (const [name, write] of Object.entries(KIND_BY_SUBTYPE[current.subtype].readBackWrites)) {
    const value = values[name];
    if (value === undefined || write?.safeParse(value).success) continue;
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      write
        ? `${current.subtype} update field '${name}': this value can be read but not written; send it back unchanged or replace it`
        : `${current.subtype} update field '${name}': the engine works this out; send it back unchanged or leave it out`,
      { details: { field: name } },
    );
  }
  const parsed = fileAnnotationPatchSchemaOf(current.subtype).safeParse(prepared);
  if (!parsed.success) throw invalidWrite(parsed.error, `${current.subtype} update`);
}

/**
 * The draft the engine writes for `draft`, in the file's coordinates:
 * prepared (`pdfPrepareAnnotationDraft`), checked against its kind, and
 * every field that follows from it stated (`pdfDeriveAnnotationDraft`). A
 * viewer predicts the same without schema validation
 * (`pdfPredictAnnotationDraft`).
 *
 * Throws `InvalidArg` for a draft the engine refuses. Pure: it reads nothing
 * but its arguments.
 */
export function pdfResolveAnnotationDraft(
  draft: AnnotationDraft<PdfCoordinates>,
  options: DraftResolveOptions = {},
): AnnotationDraft<PdfCoordinates> {
  const prepared = pdfPrepareAnnotationDraft(draft);
  assertAnnotationDraft(prepared, { linked: options.linked ?? [] });
  return pdfDeriveAnnotationDraft(prepared, options);
}

/**
 * The patch the engine writes for `patch` on `current`, in the file's
 * coordinates: prepared (`pdfPrepareAnnotationPatch`), checked against its
 * kind (`assertAnnotationPatch`), and every field that follows from it
 * stated (`pdfDeriveAnnotationPatch`). A viewer predicts the same without
 * schema validation (`pdfPredictAnnotationPatch`).
 *
 * Throws `InvalidArg` for a patch the engine refuses. Pure: it reads nothing
 * but its arguments.
 */
export function pdfResolveAnnotationPatch(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
  options: ResolveOptions = {},
): AnnotationPatch<PdfCoordinates> {
  const prepared = pdfPrepareAnnotationPatch(current, patch);
  assertAnnotationPatch(current, prepared);
  return pdfDeriveAnnotationPatch(current, prepared, options);
}

function invalidWrite(error: z.ZodError, where: string): EngineError {
  const issue = error.issues[0]!;
  const field = issue.path.join('.');
  return new EngineError(
    EngineErrorCode.InvalidArg,
    `${where}${field ? ` field '${field}'` : ''}: ${issue.message}`,
    { details: field ? { field } : {} },
  );
}
