import type { PdfLinkTargetWritable } from '../../../dto/PdfLinkTarget';
import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';

/**
 * Creates a link annotation. `target: null` is allowed — the authoring flow
 * is create-then-edit (drag the rect first, set the destination/URI from the
 * selection editor) — and only `goto`/`uri` targets are writable (see
 * {@link PdfLinkTargetWritable}).
 *
 * To group the link to another annotation (v2's attached links), pass the
 * base draft's `inReplyTo` + `replyType: 'group'` — relationship writing is
 * kind-agnostic.
 */
export interface LinkDraft extends AnnotationDraftBase {
  subtype: 'link';
  /** `/Rect` — required; a link IS its hit rectangle. */
  rect: PdfRect;
  target: PdfLinkTargetWritable | null;
}
