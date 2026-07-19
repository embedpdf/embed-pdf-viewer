import type { PdfLinkTarget } from '../../../dto/PdfLinkTarget';
import type { AnnotationBase } from '../../base';

/**
 * Link annotation (`/Subtype /Link`): an invisible hit rectangle over page
 * content that navigates somewhere. The DTO carries the NORMALIZED target
 * (see {@link PdfLinkTarget} — `/Dest` and `/A GoTo` both read as `goto`)
 * plus the base shell; links draw nothing of their own in v1 (any visible
 * border a PDF specifies still renders through the page raster).
 *
 * Links ride the base relationship fields like every kind: a link grouped
 * to another annotation (the Apryse/v2 "attached link" pattern) reads as
 * `inReplyTo` + `replyType: 'group'`.
 */
export interface LinkAnnotationDTO extends AnnotationBase {
  subtype: 'link';
  /** `null` = a dead link (no `/A`, no `/Dest`) — legal PDF, reported as-is. */
  target: PdfLinkTarget | null;
}
