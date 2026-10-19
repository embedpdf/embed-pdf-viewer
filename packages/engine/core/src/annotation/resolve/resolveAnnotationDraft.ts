import type { PdfCoordinates } from '../../pageSpace/coordinates';
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
   * and a popup's `parent`); the engine's schema check leaves them out.
   */
  linked?: readonly string[];
  /**
   * Looks up a registered font by its key, so a free text in one takes that
   * face in its rich body. The standard 14 need no lookup.
   */
  describeFont?: DescribeFont;
}

/**
 * The draft a create writes before anything follows from it, in the file's
 * coordinates, the same on the page and in the engine: its fields named by
 * its kind, and a box kind placed by its `rect` at a quarter turn stating its
 * `box` (`boxDraftFollows`). The engine checks the prepared draft against its
 * kind's schema before deriving the rest (`pdfResolveAnnotationDraft`), a
 * check that only accepts or refuses.
 *
 * Throws `InvalidArg` for a field the kind doesn't declare, and for a box
 * kind it can't place.
 */
export function pdfPrepareAnnotationDraft(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  assertDeclaredFields(draft.subtype, draft);
  return boxDraftFollows(draft);
}

/**
 * A prepared draft with every field that follows from it stated, in the
 * file's coordinates:
 *
 * - a note's standard review state brings its state model;
 * - a free text states its intent, and its text as rich text carrying its
 *   text style, with `contents` its plain projection;
 * - a redaction over text without a `rect` covers its quads;
 * - a measurement's label follows its points and scale, and its caption is
 *   stated whole.
 *
 * Throws `InvalidArg` where nothing can follow: a custom review state with no
 * model, contents that disagree with the rich text, a callout line without
 * the callout intent, a measurement it can't label. Pure: it reads nothing
 * but its arguments. Defaults stay out of the draft: a field left out reads
 * back as `annotation/defaults.ts` says.
 */
export function pdfDeriveAnnotationDraft(
  prepared: AnnotationDraft<PdfCoordinates>,
  options: DraftResolveOptions = {},
): AnnotationDraft<PdfCoordinates> {
  assertRichTextAgreement(prepared);
  const followed = redactDraftFollows(
    freeTextDraftFollows(noteDraftStateFollows(prepared), options.describeFont),
  );
  return resolveMeasurementDraft(followed);
}

/**
 * The draft the engine writes for `draft`, as a viewer predicts it: prepared
 * and derived as the engine does (`pdfPrepareAnnotationDraft`,
 * `pdfDeriveAnnotationDraft`), without schema validation. A draft the
 * engine's schema check refuses (`pdfResolveAnnotationDraft`, from
 * `@embedpdf/engine-core/validation`) is refused when the create reaches it.
 */
export function pdfPredictAnnotationDraft(
  draft: AnnotationDraft<PdfCoordinates>,
  options: DraftResolveOptions = {},
): AnnotationDraft<PdfCoordinates> {
  return pdfDeriveAnnotationDraft(pdfPrepareAnnotationDraft(draft), options);
}
