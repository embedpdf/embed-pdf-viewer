/**
 * Session-visibility composition — the ONE reading of an annotation's flags
 * "right now": the document `/F` composed with the session overlay written by
 * actions/scripts (Hide actions, `annot.hidden`). The override replaces only
 * the `hidden` bit; `noView`/`toggleNoView` semantics stay the document's.
 *
 * Session state, like `hovered`: never lowered to the engine, never saved,
 * never replicated — presentation truth for THIS client only.
 */
import { NO_ANNOTATION_FLAGS, type AnnotationFlags, type FlagBearer } from './flags';
import type { Annot, Id, Model } from './types';

export const effFlags = (m: Model, id: Id): AnnotationFlags => {
  const a = m.byId[id];
  if (!a) return NO_ANNOTATION_FLAGS;
  const override = m.sessionHidden[id];
  return override === undefined || override === a.flags.hidden
    ? a.flags
    : { ...a.flags, hidden: override };
};

/** A {@link FlagBearer} carrying the composed flags — feed the bare flag
 *  predicates (`annotInteractive`, `annotTransformable`, …) with this so a
 *  session-hidden annotation is inert and a session-SHOWN one is live. */
export const effBearer = (m: Model, a: Annot): FlagBearer => {
  const override = m.sessionHidden[a.id];
  return override === undefined || override === a.flags.hidden
    ? a
    : { subtype: a.subtype, flags: { ...a.flags, hidden: override }, authority: a.authority };
};
