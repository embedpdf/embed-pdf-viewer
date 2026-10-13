import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import {
  isFinitePdfRect,
  normalizePdfRect,
  pdfQuarterTurnBox,
  quarterTurnOf,
} from '../../geometry/convert';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { ANNOTATION_FIELD_SPACES } from '../field-spaces';
import type { AnnotationDraft } from '../kinds';

/**
 * A create once resolved (`pdfResolveAnnotationDraft`): a box kind states
 * its `box`, whether the caller gave it or placed the kind by its `rect`.
 * What the writers take.
 */
export type PlacedDraft<Draft> = Draft extends { box?: infer Box }
  ? Omit<Draft, 'box'> & { box: NonNullable<Box> }
  : Draft;

/**
 * A box kind's create placed by where it stands: a `rect` with a quarter
 * turn pins the box down, `rect` itself or its sides swapped under 90 and
 * 270 (`pdfQuarterTurnBox`). A create that gives `box` keeps it, and its
 * `rect` is worked out from it as ever, so a read sent back as a create
 * places the copy by its box.
 *
 * Refused with `InvalidArg`: a create with neither, a `rect` that isn't four
 * finite numbers, and a `rect` at another angle, where many boxes stand in
 * the same rect.
 */
export function boxDraftFollows(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (ANNOTATION_FIELD_SPACES[draft.subtype]?.box !== 'box') return draft;
  const given = draft as { box?: unknown; rect?: unknown; rotation?: number | null };
  if (given.box !== undefined) return draft;
  if (given.rect === undefined) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${draft.subtype} create: give its \`box\`, or its \`rect\` with a quarter turn`,
      { details: { field: 'box' } },
    );
  }
  if (!isFinitePdfRect(given.rect)) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${draft.subtype} create field 'rect': not a rect of finite numbers`,
      { details: { field: 'rect' } },
    );
  }
  const rotation = given.rotation ?? 0;
  const turn = quarterTurnOf(rotation);
  if (turn === null) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `${draft.subtype} create field 'rect': a rect places a box at a quarter turn; at ${rotation}° give its \`box\``,
      { details: { field: 'rect' } },
    );
  }
  const { rect: _placed, ...rest } = draft as AnnotationDraft<PdfCoordinates> & { rect?: unknown };
  return {
    ...rest,
    box: pdfQuarterTurnBox(normalizePdfRect(given.rect), turn),
  } as AnnotationDraft<PdfCoordinates>;
}
