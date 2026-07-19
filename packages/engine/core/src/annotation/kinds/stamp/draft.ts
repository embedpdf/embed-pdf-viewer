import type { PdfRect } from '../../../geometry/primitives';
import type { BinarySource, ResourceRef } from '../../../resource/BinarySource';
import type { AnnotationDraftBase } from '../../draft-base';

/**
 * How the stamp's content is scaled into `/Rect` (CSS `object-fit`
 * vocabulary; maps onto the native `EPDF_STAMP_FIT` policies):
 * `'contain'` preserves aspect and stays fully visible, `'cover'`
 * preserves aspect and fills the box (may crop), `'fill'` stretches.
 */
export type StampFit = 'contain' | 'cover' | 'fill';

/**
 * Authoring draft: what callers pass to `create()`. Bytes ride inline —
 * `source` is the content the stamp displays (PNG, JPEG, or single-page
 * PDF for vector stamps; format is sniffed from magic bytes, never from
 * the declared mime type). Engines normalize this to {@link StampWireDraft}
 * before anything is serialized (see `annotation/normalize.ts`).
 */
export interface StampDraft extends AnnotationDraftBase {
  subtype: 'stamp';
  /** `/Rect` bounding box — required. */
  rect: PdfRect;
  /** What the stamp displays: PNG, JPEG, or single-page PDF bytes. */
  source: BinarySource;
  /** `/Name` — advisory stamp label ('Approved', 'Draft', …). */
  name?: string;
  /** Scaling of the content into `rect`. Default `'contain'` (preserves aspect). */
  fit?: StampFit;
  /** Rotation (deg). Drives the `/AP` matrix via `/EMBD_Metadata`. */
  rotation?: number;
  /** Pre-rotation `/Rect` — supply together with `rotation` (FreeText pattern). */
  unrotatedRect?: PdfRect;
}

/**
 * Wire form of {@link StampDraft}: pure JSON, validated by the single Zod
 * schema on client, worker, and server. The `source` bytes travel
 * out-of-band under the referenced resource key.
 */
export interface StampWireDraft extends AnnotationDraftBase {
  subtype: 'stamp';
  rect: PdfRect;
  source: ResourceRef;
  name?: string;
  fit?: StampFit;
  rotation?: number;
  unrotatedRect?: PdfRect;
}
