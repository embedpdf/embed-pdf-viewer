import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { assertAnnotationDraft } from '../checkWrite';
import type { DescribeFont } from '../fontFaces';
import type { AnnotationDraft } from '../kinds';
import { boxDraftFollows } from './box';
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
  /**
   * Looks up a registered font by its key, so a free text in one takes that
   * face in its rich body. The standard 14 need no lookup.
   */
  describeFont?: DescribeFont;
}

/**
 * The draft the engine writes for `draft`, in the file's coordinates:
 * checked against its kind, and every field that follows from it stated.
 *
 * - A box kind placed by its `rect` at a quarter turn states its `box`.
 * - A note's standard review state brings its state model.
 * - A free text states its intent, and its text as rich text carrying its
 *   text style, with `contents` its plain projection.
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
  const placed = boxDraftFollows(draft);
  assertAnnotationDraft(placed, { linked: options.linked ?? [] });
  assertRichTextAgreement(placed);
  const followed = redactDraftFollows(
    freeTextDraftFollows(noteDraftStateFollows(placed), options.describeFont),
  );
  return resolveMeasurementDraft(followed);
}
