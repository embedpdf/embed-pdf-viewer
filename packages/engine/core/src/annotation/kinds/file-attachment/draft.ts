import type { AttachmentFileSource } from '../../../dto/Attachment';
import type { PdfRect } from '../../../geometry/primitives';
import type { AnnotationDraftBase } from '../../draft-base';
import type { ColorStyleDraftFields } from '../style.shared';

/** `/Name` icon of a file attachment annotation — ISO 32000 §12.5.6.15. */
export type FileAttachmentIcon = 'push-pin' | 'paperclip' | 'graph' | 'tag';

/**
 * FileAttachment annotation (`/Subtype /FileAttachment`): a file embedded
 * in the document at a page location, marked by an icon. The attached
 * bytes ride inline on `file` (the [[BinarySource]] rule) and are
 * create-only — replacing a file is semantically a new attachment. The
 * generated appearance is a fixed 20×20 icon anchored at the `/Rect`'s
 * bottom-left corner, drawn in `color` (`/C`) with a luminance-contrast
 * outline, exactly like the text (sticky-note) icon.
 */
export interface FileAttachmentDraft extends AnnotationDraftBase, ColorStyleDraftFields {
  subtype: 'file-attachment';
  /** `/Rect` — the icon renders 20×20 from this rect's bottom-left corner. */
  rect: PdfRect;
  /**
   * The attached file. A resolvable `name` is required (from
   * `file.name` or a browser `File`'s own name) — normalization throws
   * `InvalidArg` without one.
   */
  file: AttachmentFileSource;
  /** `/Name` icon. Default `'paperclip'` on create; absent reads as `'push-pin'`. */
  icon?: FileAttachmentIcon;
}

/**
 * Wire form of the attached file: the metadata half of
 * {@link AttachmentFileSource} stays in the JSON body (so the single Zod
 * schema validates it on client, worker, and server) while the bytes
 * travel out-of-band under the referenced resource key.
 */
export interface WireAttachmentFile {
  resource: string;
  name: string;
  mimeType?: string;
  description?: string;
}

/** Wire form of {@link FileAttachmentDraft} — pure JSON. */
export interface FileAttachmentWireDraft extends AnnotationDraftBase, ColorStyleDraftFields {
  subtype: 'file-attachment';
  rect: PdfRect;
  file: WireAttachmentFile;
  icon?: FileAttachmentIcon;
}
