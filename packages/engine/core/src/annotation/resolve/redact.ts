import { pdfPointsBounds } from '../../geometry/pointTurn';
import type { PdfCoordinates } from '../../pageSpace/coordinates';
import type { AnnotationDraft } from '../kinds';

/**
 * A redaction over text that names no `rect` covers its quads: the box
 * around them is its region.
 */
export function redactDraftFollows(
  draft: AnnotationDraft<PdfCoordinates>,
): AnnotationDraft<PdfCoordinates> {
  if (draft.subtype !== 'redact' || draft.rect != null) return draft;
  const quads = draft.quadPoints ?? [];
  if (quads.length === 0) return draft;
  const rect = pdfPointsBounds(quads.flatMap((quad) => [quad.p1, quad.p2, quad.p3, quad.p4]));
  return { ...draft, rect };
}
