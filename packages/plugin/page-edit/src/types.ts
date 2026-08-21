import {
  createCapabilityToken,
  type AbortablePromise,
  type PageObjectNumber,
  type PageRotation,
  type PageRotateResult,
  type PageMoveResult,
  type PageDeleteResult,
  type PageInsertResult,
  type PdfSize,
} from '@embedpdf/core';

/**
 * Where added pages land. The PON anchors are the thumbnail gestures ("+
 * after this page") and stay correct across a concurrent reorder between
 * click and call — a raw index does not; `index` remains for absolute
 * positions ("at the start"). Omitted → append. Resolved to the engine's
 * index wire by the capability at call time, from the registry.
 */
export type PagePlacement =
  | { after: PageObjectNumber }
  | { before: PageObjectNumber }
  | { index: number };

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
   * `effectiveScope` includes `doc.pages.assemble` (PDF bit 11). UIs gate
   * ALL their edit affordances on this, the add verbs included (rotate,
   * move, delete, addBlank, and insert share the one capability); the
   * engine independently enforces the same capability and throws
   * `PermissionDenied` if a call slips through.
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

  /**
   * Create blank pages — gate the affordance on `canEdit()`, like every
   * other structure verb (the add verbs share the `doc.pages.assemble`
   * capability and are mandatory on the engine contract). `size` defaults
   * to the page the new pages sit beside — the anchor for PON placements,
   * else the insertion point's predecessor, else the last page — so "add
   * page" matches the document without an A4-vs-Letter guess. That default
   * is a registry read, which is why it lives HERE and the engine wire
   * stays explicit (the `rotateBy` law). `count` defaults to 1.
   */
  addBlank(opts?: {
    size?: PdfSize;
    count?: number;
    placement?: PagePlacement;
  }): AbortablePromise<PageInsertResult>;

  /**
   * Copy every page of a standalone PDF (`bytes`) in at the placement —
   * the merge/import gesture. Forwards to `pages.insert`; the inserted
   * copies get fresh PONs, returned in insertion order.
   */
  insert(
    bytes: Uint8Array | ArrayBuffer,
    opts?: { placement?: PagePlacement },
  ): AbortablePromise<PageInsertResult>;
}

export const PageEditToken = createCapabilityToken<PageEditCapability>('page-edit');
