/**
 * @embedpdf/plugin-page-edit/contract — the document's page structure, edited:
 * rotate, reorder, delete, insert, duplicate and extract, and which pages are
 * selected. A page argument is a `PageRef` or an index, the page at that index
 * when the verb is called; refs are what to keep, because an index shifts the
 * moment a page before it moves or goes. A position names its page by ref. Page
 * changes are announced by `documents.onPagesChanged`; this plugin adds no
 * events of its own.
 */
import type { OperationOptions, PagePosition, PageRef, PdfRotation, PdfSize } from '@embedpdf/core';

export { PageEditToken } from './token';
/**
 * `PagePosition` is where pages go, the engine's: right after or before a
 * page (`{ after: pageRef }`, `{ before: pageRef }`), or `'start'` / `'end'`.
 * It names a neighbour, so it stays right when pages move before the edit
 * applies.
 */
export type { PagePosition, PdfRotation, PdfSize } from '@embedpdf/core';

/** What an insert resolves: the new pages, in the order they were inserted. */
export interface PageEditInsertResult {
  readonly pages: readonly PageRef[];
}

/** Options of `insertBlank()`. */
export interface PageInsertBlankOptions extends OperationOptions {
  /** Where the new pages go. Default `'end'`. */
  readonly position?: PagePosition;
  /** The page size, in points. Default: the size of the page the new pages go next to. */
  readonly size?: PdfSize;
  /** How many blank pages. Default 1. */
  readonly count?: number;
}

/** Options of `insertFromBytes()`. */
export interface PageInsertFromBytesOptions extends OperationOptions {
  /** Only the source PDF's pages at these indexes, in this order. Default: every page. */
  readonly pageIndexes?: readonly number[];
  /** Where the new pages go. Default `'end'`. */
  readonly position?: PagePosition;
}

/** Options of the verbs that copy pages in: `insertFromDocument()` and `duplicate()`. */
export interface PagePositionOptions extends OperationOptions {
  readonly position?: PagePosition;
}

/**
 * Every edit is one change: one step of the history, so undo brings the
 * pages back as they were, a deleted page with its annotations under its old
 * ref. A rotate, a move, a delete and a blank insert show in the page list at
 * once, and so does undoing one; when the engine refuses the edit, the pages
 * go back. Pages copied in show once the engine answers. Edits apply in the
 * order they were called, except that the verbs that copy pages first
 * (`duplicate()`, `insertFromDocument()`, `insertFromBytes()` with
 * `pageIndexes`) take their place once the copy is made.
 *
 * Every verb rejects `permission-denied` (with `error.permission`) when the
 * session may not do it, `not-found` for a page the document doesn't have and
 * `invalid-input` for no pages; a refusal changes nothing. An edit the engine
 * refuses rejects with the engine's reason. When the `signal` fires the verb
 * rejects `operation-cancelled`: before its change is made nothing changes,
 * after it the change still applies.
 */
export interface PageEditCapability {
  /** Whether rotating, reordering, deleting and inserting pages is allowed (`doc.pages.assemble`). */
  canEdit(): boolean;
  /**
   * Whether copying pages out is allowed (`doc.download`): `extract()`,
   * `duplicate()` and `insertFromDocument()` need it.
   */
  canExtract(): boolean;

  /** The selected pages, in the order they were selected; pages the document no longer has drop out. */
  getSelected(): readonly PageRef[];
  /** Make these pages the selection; `[]` clears it. Pages the document doesn't have are left out. */
  select(pages: readonly (PageRef | number)[]): void;

  /**
   * Turn each page by a quarter or half turn from its rotation, the one it
   * has once the edits on their way apply: two quick quarter turns are a
   * half turn.
   */
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
  /** Move pages to `position`; several pages keep their order and land together. */
  reorder(
    pages: readonly (PageRef | number)[],
    position: PagePosition,
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
    options?: PagePositionOptions,
  ): Promise<PageEditInsertResult>;
  /**
   * Copy pages as they show, with the edits on their way, right after the
   * last of them unless `position` says otherwise.
   */
  duplicate(
    pages: readonly (PageRef | number)[],
    options?: PagePositionOptions,
  ): Promise<PageEditInsertResult>;
  /**
   * Copy pages into a new PDF, as they show with the edits on their way, and
   * resolve its bytes. This document doesn't change.
   */
  extract(pages: readonly (PageRef | number)[], options?: OperationOptions): Promise<Uint8Array>;
}
