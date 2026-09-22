/**
 * @embedpdf/plugin-page-edit/contract — structural page operations, addressed
 * by durable page refs (never display index — an index shifts the moment a
 * sibling is moved or deleted). Mirrors the engine's page service, plus the
 * relative rotate gesture and the placements the thumbnail gestures speak.
 * Page-registry events are on `documents.onPagesChanged`; this plugin adds none.
 */
import type {
  OperationOptions,
  PageDeleteResult,
  PageInsertResult,
  PageMoveResult,
  PageRef,
  PageRotateResult,
  PageRotation,
  PdfSize,
} from '@embedpdf/core';

export { PageEditToken } from './token';
export type {
  PageDeleteResult,
  PageInsertResult,
  PageMoveResult,
  PageRotateResult,
  PageRotation,
  PdfSize,
} from '@embedpdf/core';

/**
 * Where pages land. The ref anchors are the thumbnail gestures ("+ after this
 * page") and stay correct across a concurrent reorder between click and call —
 * a raw index does not; `index` remains for absolute positions ("at the
 * start") and `'end'` appends. Resolved to the engine's index wire at call
 * time, from the registry.
 */
export type PagePlacement = { after: PageRef } | { before: PageRef } | { index: number } | 'end';

export interface PageEditCapability {
  /**
   * Whether this caller may perform structural page edits — the session grants
   * `doc.pages.assemble` (PDF bit 11). Every verb here shares that one
   * capability; the engine enforces it independently and refuses a call that
   * slips through (`permission-denied`).
   */
  canEdit(): boolean;

  /**
   * Rotate pages by a relative quarter- or half-turn; each page's own
   * rotation is read first. Pages are grouped by their resulting absolute
   * rotation and each group is one engine call, in order. Resolves with the
   * last group's result only: its `layout` is the whole page list after every
   * group, and its `cache` belongs to that last call. Rejects `not-found` for
   * a page the document does not have and `invalid-input` for no pages.
   */
  rotateBy(
    pages: readonly PageRef[],
    delta: 90 | -90 | 180,
    options?: OperationOptions,
  ): Promise<PageRotateResult>;
  /** Set one absolute rotation on pages. */
  setRotation(
    pages: readonly PageRef[],
    rotation: PageRotation,
    options?: OperationOptions,
  ): Promise<PageRotateResult>;
  /** Reorder pages as a contiguous block at the placement. */
  move(
    pages: readonly PageRef[],
    placement: PagePlacement,
    options?: OperationOptions,
  ): Promise<PageMoveResult>;
  /** Delete pages. The engine rejects deleting every page. */
  delete(pages: readonly PageRef[], options?: OperationOptions): Promise<PageDeleteResult>;
  /**
   * Blank pages. `size` defaults to the page the new pages sit beside — the
   * anchor of a ref placement, else the insertion point's predecessor, else
   * the last page. `count` defaults to 1; `placement` to `'end'`.
   */
  insertBlank(
    options?: { count?: number; size?: PdfSize; placement?: PagePlacement } & OperationOptions,
  ): Promise<PageInsertResult>;
  /** Pages of another PDF, optionally a subset by index. */
  insertFromBytes(
    bytes: Uint8Array | ArrayBuffer,
    options?: { pageIndexes?: readonly number[]; placement?: PagePlacement } & OperationOptions,
  ): Promise<PageInsertResult>;
  /** Pages of another open document. */
  insertFromDocument(
    documentId: string,
    pages: readonly PageRef[],
    options?: { placement?: PagePlacement } & OperationOptions,
  ): Promise<PageInsertResult>;
  /** Copy pages within the document. Default placement: right after the last of them. */
  duplicate(
    pages: readonly PageRef[],
    options?: { placement?: PagePlacement } & OperationOptions,
  ): Promise<PageInsertResult>;
  /** A new PDF from a page subset. */
  extract(pages: readonly PageRef[], options?: OperationOptions): Promise<Uint8Array>;
}
