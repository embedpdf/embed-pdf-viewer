/**
 * @embedpdf/plugin-page-edit/contract — the document's page structure, edited:
 * rotate, reorder, delete, insert, duplicate and extract. A page argument is a
 * `PageRef` or an index; refs are what to keep, because an index shifts the
 * moment a page before it moves or goes. Page changes are announced by
 * `documents.onPagesChanged`; this plugin adds no events of its own.
 */
import type { OperationOptions, PageRef, PdfRotation, PdfSize } from '@embedpdf/core';

export { PageEditToken } from './token';
export type { PdfRotation, PdfSize } from '@embedpdf/core';

/**
 * Where pages land: right after or before a page, or at the start or the end.
 * A page named by its index is the page at that index when the verb is
 * called, the page the user clicked; from then on it is that page, so the
 * placement stays right when pages are reordered before the edit runs.
 */
export type PagePlacement =
  | { readonly after: PageRef | number }
  | { readonly before: PageRef | number }
  | 'start'
  | 'end';

/** What an insert resolves: the new pages, in the order they were inserted. */
export interface PageEditInsertResult {
  readonly pages: readonly PageRef[];
}

/** Options of `insertBlank()`. */
export interface PageInsertBlankOptions extends OperationOptions {
  /** Where the new pages go. Default `'end'`. */
  readonly placement?: PagePlacement;
  /** The page size, in points. Default: the size of the page the new pages are placed next to. */
  readonly size?: PdfSize;
  /** How many blank pages. Default 1. */
  readonly count?: number;
}

/** Options of `insertFromBytes()`. */
export interface PageInsertFromBytesOptions extends OperationOptions {
  /** Only the source PDF's pages at these indexes, in this order. Default: every page. */
  readonly pageIndexes?: readonly number[];
  /** Where the new pages go. Default `'end'`. */
  readonly placement?: PagePlacement;
}

/** Options of the verbs that copy pages in: `insertFromDocument()` and `duplicate()`. */
export interface PagePlacementOptions extends OperationOptions {
  readonly placement?: PagePlacement;
}

/**
 * Every edit runs in the order it was called, after the edits before it.
 * Every verb rejects `permission-denied` (with `error.permission`) when the
 * session may not do it, `not-found` for a page the document doesn't have,
 * `invalid-input` for no pages, and `operation-cancelled` when its `signal`
 * fires; a refusal changes nothing.
 */
export interface PageEditCapability {
  /** Whether rotating, reordering, deleting and inserting pages is allowed (`doc.pages.assemble`). */
  canEdit(): boolean;
  /**
   * Whether copying pages out is allowed (`doc.download`): `extract()`,
   * `duplicate()` and `insertFromDocument()` need it.
   */
  canExtract(): boolean;

  /** Turn each page by a quarter or half turn from its own rotation. */
  rotateBy(
    pages: readonly (PageRef | number)[],
    delta: 90 | -90 | 180,
    options?: OperationOptions,
  ): Promise<void>;
  /** Give every page the same rotation. */
  setRotation(
    pages: readonly (PageRef | number)[],
    rotation: PdfRotation,
    options?: OperationOptions,
  ): Promise<void>;
  /** Move pages to the placement; several pages keep their order and land together. */
  reorder(
    pages: readonly (PageRef | number)[],
    placement: PagePlacement,
    options?: OperationOptions,
  ): Promise<void>;
  /** Delete pages. Deleting every page is refused (`invalid-input`): a document keeps one. */
  delete(pages: readonly (PageRef | number)[], options?: OperationOptions): Promise<void>;
  /** Insert blank pages, one unless `count` says more. */
  insertBlank(options?: PageInsertBlankOptions): Promise<PageEditInsertResult>;
  /** Insert the pages of another PDF, or only the ones at `pageIndexes`. */
  insertFromBytes(
    bytes: Uint8Array | ArrayBuffer,
    options?: PageInsertFromBytesOptions,
  ): Promise<PageEditInsertResult>;
  /**
   * Insert copies of pages from another document open in the viewer. Needs
   * `doc.download` on that document and `doc.pages.assemble` on this one.
   */
  insertFromDocument(
    documentId: string,
    pages: readonly (PageRef | number)[],
    options?: PagePlacementOptions,
  ): Promise<PageEditInsertResult>;
  /** Copy pages, right after the last of them unless a placement says otherwise. */
  duplicate(
    pages: readonly (PageRef | number)[],
    options?: PagePlacementOptions,
  ): Promise<PageEditInsertResult>;
  /** Copy pages into a new PDF and resolve its bytes. This document doesn't change. */
  extract(pages: readonly (PageRef | number)[], options?: OperationOptions): Promise<Uint8Array>;
}
