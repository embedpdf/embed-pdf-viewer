import type { z } from 'zod';

import { semanticEqual } from './appearance';
import type { AnnotationDTO } from './kinds';
import { AnnotationDraftSchema, annotationPatchSchemaOf, KIND_BY_SUBTYPE } from './kinds';
import type { AnnotationDraft, AnnotationPatch } from './kinds';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

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
 * and the rest is checked against the kind's update schema.
 */
export function checkAnnotationPatch(
  current: AnnotationDTO,
  patch: AnnotationPatch,
): AnnotationPatch {
  if (current.subtype === 'unsupported') return patch;
  const readBackWrites = KIND_BY_SUBTYPE[current.subtype].readBackWrites;
  let checked = patch;
  for (const [name, write] of Object.entries(readBackWrites)) {
    const value = (patch as Record<string, unknown>)[name];
    if (value === undefined || write.safeParse(value).success) continue;
    if (!semanticEqual(value, (current as unknown as Record<string, unknown>)[name])) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `${current.subtype} update field '${name}': this value can be read but not written; send it back unchanged or replace it`,
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

function invalidWrite(error: z.ZodError, where: string): EngineError {
  const issue = error.issues[0]!;
  const field = issue.path.join('.');
  return new EngineError(
    EngineErrorCode.InvalidArg,
    `${where}${field ? ` field '${field}'` : ''}: ${issue.message}`,
    { details: field ? { field } : {} },
  );
}
