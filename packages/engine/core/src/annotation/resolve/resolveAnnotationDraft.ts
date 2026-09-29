import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { assertAnnotationDraft } from '../checkWrite';
import type { AnnotationDraft } from '../kinds';
import { freeTextDraftFollows } from './freeText';
import { resolveMeasurementDraft } from './measurement';
import { redactDraftFollows } from './redact';
import { assertDeclaredFields } from './resolveAnnotationPatch';
import { assertRichTextAgreement, noteDraftStateFollows } from './text';

export interface DraftResolveOptions {
  /**
   * Link fields the caller takes out and links itself (a change set's `reply`
   * and a popup's `parent`); the schema check leaves them out.
   */
  linked?: readonly string[];
}

/**
 * The draft the engine writes for `draft`, in the file's coordinates:
 * checked against its kind, and every field that follows from it stated.
 *
 * - A note's standard review state brings its state model.
 * - A free text's rich text and `contents` follow each other.
 * - A redaction over text without a `rect` covers its quads.
 * - A measurement's label follows its points and scale, and its caption is
 *   stated whole.
 *
 * Throws `InvalidArg` for a draft the engine refuses. Pure: it reads nothing
 * but its arguments. Defaults stay out of the draft: a field left out reads
 * back as `annotation/defaults.ts` says.
 */
export function pdfResolveAnnotationDraft(
  draft: AnnotationDraft<PdfCoordinates>,
  options: DraftResolveOptions = {},
): AnnotationDraft<PdfCoordinates> {
  assertDeclaredFields(draft.subtype, draft);
  assertAnnotationDraft(draft, { linked: options.linked ?? [] });
  assertRichTextAgreement(draft);
  const followed = redactDraftFollows(freeTextDraftFollows(noteDraftStateFollows(draft)));
  return resolveMeasurementDraft(followed);
}
