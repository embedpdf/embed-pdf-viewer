import type { DocumentOutline, OutlineItemDraft, OutlineItemPatch } from '../dto/DocumentOutline';
import type { OutlineItemRef } from '../identity/OutlineItemRef';
import type { OutlinePosition } from '../mutation/ListPosition';
import type {
  OutlineCreateResult,
  OutlineDeleteResult,
  OutlineMoveResult,
  OutlineUpdateResult,
} from '../mutation/OutlineMutationResults';
import type { WriteOptions } from '../mutation/WriteOptions';
import type { AbortablePromise } from '../promise/AbortablePromise';

/** Where `create` puts a new item, and the name it gets. */
export interface OutlineCreateOptions extends WriteOptions {
  /** The item it goes under; the top level when left out or `null`. */
  parent?: OutlineItemRef | null;
  /** Its place among `parent`'s children; the end when left out. */
  position?: OutlinePosition;
  /** Its object number, taken from `doc.objectNumbers`; the engine picks one when left out. */
  objectNumber?: number;
}

/**
 * The document's outline (`/Root /Outlines`, the bookmarks). Reading it is
 * part of opening the document (`doc.open`); writing takes
 * `doc.outline.modify`. Each write is a one-op change: the same op, checks
 * and undo as `doc.apply`, its events `outline.*`.
 */
export interface DocumentOutlineService {
  /** Every item, depth first. */
  get(): AbortablePromise<DocumentOutline>;
  /** A new item; `'outline.create'` in a change. */
  create(
    data: OutlineItemDraft,
    options?: OutlineCreateOptions,
  ): AbortablePromise<OutlineCreateResult>;
  /** Change the fields `patch` names; `'outline.update'` in a change. */
  update(
    ref: OutlineItemRef,
    patch: OutlineItemPatch,
    options?: WriteOptions,
  ): AbortablePromise<OutlineUpdateResult>;
  /**
   * Move items, each with the items under it, under `parent` (`null`: the
   * top level) at `position` among its children; `'outline.move'` in a
   * change.
   */
  move(
    refs: readonly OutlineItemRef[],
    parent: OutlineItemRef | null,
    position: OutlinePosition,
    options?: WriteOptions,
  ): AbortablePromise<OutlineMoveResult>;
  /** Delete an item and the items under it; `'outline.delete'` in a change. */
  delete(ref: OutlineItemRef, options?: WriteOptions): AbortablePromise<OutlineDeleteResult>;
}
