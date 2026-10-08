import type { AnnotationList } from '../annotation/AnnotationList';
import type { AnnotationDraft, AnnotationPatch } from '../annotation/kinds';
import type { AnnotationResourceRole } from '../annotation/resources';
import type {
  AnnotationAppearanceImageOptions,
  AnnotationAppearanceImagesResult,
  AnnotationAppearanceRenderOptions,
  AnnotationAppearancesResult,
} from '../dto/AnnotationRender';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { AnnotationFlattenResult } from '../mutation/AnnotationFlattenResult';
import type { AnnotationPosition } from '../mutation/ListPosition';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationReorderResult,
  AnnotationUpdateResult,
} from '../mutation/AnnotationMutationResults';
import type {
  AnnotationCreateOptions,
  AnnotationUpdateOptions,
  FlattenWriteOptions,
  WriteOptions,
} from '../mutation/WriteOptions';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Per-page annotation service exposed via `PageHandle.annotations`.
 *
 * `list()` returns the page's fully typed annotations except widgets, which
 * are the form's (`doc.forms.list()`); every annotation write of one page
 * goes through this service.
 */
export interface PageAnnotationsService {
  /** This page's annotations except widgets, in display order: `doc.annotations.list()` for one page. */
  list(): AbortablePromise<AnnotationList>;
  /**
   * Batch-render every annotation appearance (`/AP`) stream on the page,
   * widgets excepted (`page.forms.renderAppearances()` has those), into
   * its own image, sized to the annotation's `/Rect`: encoded by the engine's
   * image encoder (local) or fetched as a `multipart/form-data` body (cloud),
   * each a lazily-resolved `PageImageHandle`. Read-only and gated by
   * `doc.annotate.read`: reading an annotation implies you may see its
   * rendered appearance (the Adobe boundary).
   */
  renderAppearances(
    options?: AnnotationAppearanceImageOptions,
  ): AbortablePromise<AnnotationAppearanceImagesResult>;
  /**
   * One of an annotation's resources: the bytes `create(data, { resources })`
   * takes to make the same annotation again. A read never contains them.
   *
   * - `appearance` (stamps): the drawing, as a one-page PDF, before the fit,
   *   rotation and opacity the data describes. A stamp another tool made is
   *   drawn as the page shows it, on a page the size of its `/Rect`.
   * - `file` (file attachments): the attached file's exact bytes; its name,
   *   MIME type and description are the data's `file`.
   *
   * Egresses content, so it needs `doc.download`. A role the annotation's
   * kind doesn't take is refused with `InvalidArg`.
   */
  downloadResource(ref: AnnotationRef, role: AnnotationResourceRole): AbortablePromise<Uint8Array>;
  /**
   * Create an annotation on this page from its data. The options say how:
   * bytes beside the data by role (`resources`: a stamp needs its
   * `appearance`, a file attachment its `file`; a resource the kind doesn't
   * take is refused), and the object number it gets (`objectNumber`, taken
   * from `doc.objectNumbers`), which makes its ref known before the engine
   * answers. Without a number the engine picks the next free one. Without
   * an `nm` in the data the annotation gets a fresh UUIDv7 `/NM`.
   *
   * A number this session doesn't hold, or one an object already has, is
   * refused with `ObjectNumberUnavailable`.
   */
  create(
    data: AnnotationDraft,
    options?: AnnotationCreateOptions,
  ): AbortablePromise<AnnotationCreateResult>;
  /**
   * Change the fields `patch` names; the others stay. A resource replaces
   * what it is for: a stamp's drawing, an attached file's bytes.
   */
  update(
    ref: AnnotationRef,
    patch: AnnotationPatch,
    options?: AnnotationUpdateOptions,
  ): AbortablePromise<AnnotationUpdateResult>;
  delete(ref: AnnotationRef, options?: WriteOptions): AbortablePromise<AnnotationDeleteResult>;
  /**
   * Change the stacking order: the annotations go together, in the order
   * given, to `position` in the page's paint order (later paints over
   * earlier): next to a neighbour (`{ before: ref }`, `{ after: ref }`) or at
   * `'start'` (bottom) / `'end'` (top). Widgets paint above every annotation
   * and have their own order (`doc.forms.reorderWidgets()`): a widget, as a
   * row or a neighbour, is refused with `InvalidArg`. A neighbour that isn't
   * on the page is `NotFound`. Answers the page's new order. Emits
   * `annotations.reordered`.
   */
  reorder(
    refs: AnnotationRef[],
    position: AnnotationPosition,
    options?: WriteOptions,
  ): AbortablePromise<AnnotationReorderResult>;

  /**
   * Flatten the given annotations of this page into its content —
   * `pages.flatten` for a chosen set. Painted annotations are removed from
   * the page; ones that are ineligible (hidden for `usage`, Popups, no
   * usable appearance) stay and report `unchanged`, so a caller can say
   * "2 of 3 flattened". A content + annotation mutation of this page: its
   * content and annotation pins advance, layout does not; a
   * `annotations.flattened` event is published when anything was applied.
   * Gated like `pages.flatten` (`doc.pages.modify` + `doc.annotate.modify`).
   * `InvalidArg` for a ref on another page; `NotFound` for an unknown ref.
   */
  flatten(
    refs: AnnotationRef[],
    options?: FlattenWriteOptions,
  ): AbortablePromise<AnnotationFlattenResult>;

  /**
   * Flatten the normal appearances of the given annotations of this page
   * into a new single-page PDF sized to their union `/Rect` — vector,
   * positions preserved, exactly as this page shows them. The same plan as
   * `flatten` aimed at a fresh page; the source document is untouched. A
   * derived read that egresses content, so it is gated by `doc.download`
   * like `pages.extract`. All-or-nothing: `InvalidArg` when any ref is not
   * on this page, hidden, or has no appearance (a stamp silently missing a
   * part would be worse than an error).
   */
  exportAppearance(refs: AnnotationRef[]): AbortablePromise<Uint8Array>;
}

/** A local engine page's annotations: the shared service and the raw appearance pixels. */
export interface LocalPageAnnotationsService extends PageAnnotationsService {
  /**
   * The same appearances as `renderAppearances()`, each as its own raw RGBA
   * raster instead of an encoded image.
   */
  renderAppearancesRaw(
    options?: AnnotationAppearanceRenderOptions,
  ): AbortablePromise<AnnotationAppearancesResult>;
}
