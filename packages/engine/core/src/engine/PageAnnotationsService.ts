import type { AnnotationListPageSnapshot } from '../annotation/AnnotationListSnapshot';
import type { AnnotationDraft, AnnotationPatch } from '../annotation/kinds';
import type {
  AnnotationAppearanceImageOptions,
  AnnotationAppearanceImagesResult,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
} from '../dto/AnnotationRender';
import type { AttachmentContent } from '../dto/Attachment';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { AnnotationFlattenResult } from '../mutation/AnnotationFlattenResult';
import type { PageFlattenUsage } from '../mutation/PageFlattenResult';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationMoveResult,
  AnnotationUpdateResult,
} from '../mutation/AnnotationMutationResults';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Per-page annotation service exposed via `PageHandle.annotations`.
 *
 * `list()` is the slow path: the engine acquires a `pagePtr` from the
 * `PagePtrPool`, dispatches per-subtype readers, and returns
 * fully-typed annotations. Mutations all funnel through this service
 * because they need a `pagePtr` anyway.
 *
 * Mutation methods are typed in this slice but throw
 * `EngineError(NotImplemented)` until the next slice. The signatures are
 * stable so client code can be written against them today.
 */
export interface PageAnnotationsService {
  list(): AbortablePromise<AnnotationListPageSnapshot>;
  /**
   * Batch-render every annotation appearance (`/AP`) stream on the page into
   * its own raw RGBA raster, sized to the annotation's `/Rect`. Read-only and
   * gated by `doc.annotate.read` — reading an annotation implies you may see
   * its rendered appearance (the Adobe boundary).
   *
   * Cloud engines do not expose the raw rasters (the HTTP surface ships
   * encoded images); use {@link renderAppearanceImages} there instead.
   */
  renderAppearances(
    options?: AnnotationAppearanceRenderOptions,
  ): AbortablePromise<AnnotationAppearancesResult>;
  /**
   * Encoded counterpart of {@link renderAppearances}: each raster is run
   * through the engine's image encoder (local) or fetched as a
   * `multipart/form-data` body (cloud) and returned as a lazily-resolved
   * `PageImageHandle`. This is the cross-engine portable surface.
   */
  renderAppearanceImages(
    options?: AnnotationAppearanceImageOptions,
  ): AbortablePromise<AnnotationAppearanceImagesResult>;
  /**
   * Decode and return the file embedded in a FileAttachment annotation
   * (its `/FS` filespec). A read — listings carry the file's metadata
   * (`FileAttachmentAnnotationDTO.file`); this is the explicit bytes-out
   * call. Optional while the cloud endpoint ships (the `extract?`
   * pattern); feature-detect with `annotations.downloadFile !== undefined`.
   * Throws `EngineError(InvalidArg)` when the annotation is not a
   * file-attachment or has no embedded file stream.
   */
  downloadFile?(ref: AnnotationRef): AbortablePromise<AttachmentContent>;
  create(draft: AnnotationDraft): AbortablePromise<AnnotationCreateResult>;
  update(ref: AnnotationRef, patch: AnnotationPatch): AbortablePromise<AnnotationUpdateResult>;
  delete(ref: AnnotationRef): AbortablePromise<AnnotationDeleteResult>;
  /**
   * Batch move (contiguous-block; `refs.length === 1` is the
   * single-annotation case). Refs may mix stable ids and weak `index`
   * refs; weak refs are opportunistically upgraded to durable `/NM`
   * before the move (same rule as `update()`). Atomic — one revision
   * bump and one impact computation per batch.
   *
   * @param refs Annotations to move, in the order they should appear
   *             after the move.
   * @param toIndex Insertion point in the post-removal /Annots index
   *                space, in `[0, count - refs.length]`.
   */
  move(refs: AnnotationRef[], toIndex: number): AbortablePromise<AnnotationMoveResult>;

  /**
   * Flatten the given annotations of THIS page into its content —
   * `pages.flatten` for a chosen set. Painted annotations are removed from
   * the page; ones that are ineligible (hidden for `usage`, Popups, no
   * usable appearance) stay and report `skipped`, so a caller can say
   * "2 of 3 flattened". A content + annotation MUTATION of this page: its
   * content and annotation pins advance, layout does not; a
   * `annotations.flattened` event is published when anything was applied.
   * Gated like `pages.flatten` (`doc.pages.modify` + `doc.annotate.modify`).
   * `InvalidArg` for a ref on another page; `NotFound` for an unknown ref.
   * Optional while transports ship — feature-detect.
   */
  flatten?(
    refs: AnnotationRef[],
    usage?: PageFlattenUsage,
  ): AbortablePromise<AnnotationFlattenResult>;

  /**
   * Flatten the normal appearances of the given annotations of this page
   * into a NEW single-page PDF sized to their union `/Rect` — vector,
   * positions preserved, exactly as this page shows them. The same plan as
   * `flatten` aimed at a fresh page; the source document is untouched. A
   * derived READ that egresses content, so it is gated by `doc.download`
   * like `pages.extract`. All-or-nothing: `InvalidArg` when any ref is not
   * on this page, hidden, or has no appearance (a stamp silently missing a
   * part would be worse than an error). Optional — feature-detect.
   */
  exportAppearance?(refs: AnnotationRef[]): AbortablePromise<Uint8Array>;
}
