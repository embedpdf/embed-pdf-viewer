import { EngineError } from '../../errors/EngineError';
import { EngineErrorCode } from '../../errors/EngineErrorCode';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { standardStateModelOf } from '../comments';
import type { AnnotationDraft, Annotation, AnnotationPatch } from '../kinds';

/**
 * A review state needs its model (ISO 32000 §12.5.6.3): a standard state
 * brings its own, so only a custom state with none is refused.
 */
function stateNeedsModel(state: string): EngineError {
  return new EngineError(
    EngineErrorCode.InvalidArg,
    `text: the custom state '${state}' needs a stateModel`,
    { details: { field: 'stateModel' } },
  );
}

/**
 * A note draft's state with its model filled in: a standard state brings its
 * own; a custom state without one is refused, before the first write.
 */
export function noteDraftStateFollows(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (draft.subtype !== 'text' || draft.state == null || draft.stateModel != null) return draft;
  const model = standardStateModelOf(draft.state);
  if (!model) throw stateNeedsModel(draft.state);
  return { ...draft, stateModel: model };
}

/**
 * A note's new state with its model filled in: a standard state sets its
 * own; a custom one keeps the annotation's, and needs one.
 */
export function noteStateFollows(
  current: Annotation<PdfCoordinates>,
  patch: AnnotationPatch<PdfCoordinates>,
): AnnotationPatch<PdfCoordinates> {
  if (current.subtype !== 'text' || patch.subtype !== 'text') return patch;
  if (patch.state == null || patch.stateModel !== undefined) return patch;
  const model = standardStateModelOf(patch.state);
  if (model) return { ...patch, stateModel: model };
  if (!current.stateModel) throw stateNeedsModel(patch.state);
  return patch;
}
