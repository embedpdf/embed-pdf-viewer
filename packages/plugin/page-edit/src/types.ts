import {
  createCapabilityToken,
  type AbortablePromise,
  type PageObjectNumber,
  type PageRotation,
  type PageRotateResult,
  type PageMoveResult,
  type PageDeleteResult,
} from '@embedpdf/core';

/**
 * Structural page edits, addressed by durable PON (never display index — an
 * index shifts the moment a sibling is moved or deleted). Mirrors the engine's
 * `DocumentPagesService` 1:1, with one addition the engine can't have: the
 * relative `rotateBy` gesture. The engine wire is always ABSOLUTE; turning a
 * "+90° on this thumbnail" click into an absolute value needs the page's
 * current rotation, so that read+arithmetic lives HERE — once — instead of
 * being re-derived in every framework adapter's click handler.
 *
 * Document-scoped: rotation is shared document metadata, so editing through the
 * sidebar lens and seeing it in the main lens is automatic (both read the same
 * registry, which the kernel keeps in sync from the engine's event stream).
 */
export interface PageEditCapability {
  /**
   * Whether this caller is authorized to perform structural page edits —
   * `effectiveScope` includes `doc.pages.assemble` (PDF bit 11). UIs gate their
   * edit affordances on this; the engine independently enforces the same
   * capability and throws `PermissionDenied` if a call slips through.
   */
  canEdit(): boolean;

  /**
   * Rotate a SINGLE page by a relative quarter-turn — the per-thumbnail button
   * gesture. Reads the page's current rotation from the registry and forwards
   * the resulting absolute rotation to the engine.
   */
  rotateBy(pon: PageObjectNumber, delta: 90 | -90): AbortablePromise<PageRotateResult>;

  /**
   * Set the ABSOLUTE rotation of one or more pages to a single shared value —
   * the multi-select gesture. Maps 1:1 to the engine.
   */
  setRotation(pons: PageObjectNumber[], rotation: PageRotation): AbortablePromise<PageRotateResult>;

  /** Reorder pages (by PON) as a contiguous block starting at `destIndex`. */
  move(pons: PageObjectNumber[], destIndex: number): AbortablePromise<PageMoveResult>;

  /** Delete pages by PON. The engine rejects deleting every page. */
  delete(pons: PageObjectNumber[]): AbortablePromise<PageDeleteResult>;
}

export const PageEditToken = createCapabilityToken<PageEditCapability>('page-edit');
