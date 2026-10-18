/** @embedpdf/plugin-outline/contract: the public outline vocabulary. */
import type { EventHook, EventOrigin, OperationOptions, ResourceStatus } from '@embedpdf/core';
import type {
  DocumentOutline,
  OutlineItem,
  OutlineItemDraft,
  OutlineItemPatch,
  OutlineItemRef,
  OutlinePosition,
  PdfLinkTargetWritable,
} from '@embedpdf/engine-core/runtime';
import type { LinkActivation } from '@embedpdf/plugin-link/contract';

export { OutlineToken } from './token';
export type {
  DocumentOutline,
  LinkActivation,
  OutlineItem,
  OutlineItemDraft,
  OutlineItemPatch,
  OutlineItemRef,
  OutlinePosition,
};

/** One row of the outline as a tree view draws it. */
export interface OutlineRow {
  readonly item: OutlineItem;
  /** How deep it sits: 0 at the top level. */
  readonly depth: number;
  readonly hasChildren: boolean;
  /** Whether its children show. */
  readonly expanded: boolean;
}

/** A new item: its fields, and where it goes. Everything left out has a default. */
export interface OutlineItemInput extends Partial<OutlineItemDraft> {
  /** The item it goes under; the top level when left out or `null`. */
  readonly parent?: OutlineItemRef | null;
  /** Its place among the parent's children; the end when left out. */
  readonly position?: OutlinePosition;
}

export interface OutlineCreateOptions extends OperationOptions {
  /** Select the new item and expand the items it sits under, as making it in a panel does. */
  readonly select?: boolean;
}

/**
 * A confirmed change of the outline, whoever made it: this session, the
 * document's scripts or another session. Fires after the reads show it.
 */
export interface OutlineChangedEvent {
  readonly type: 'created' | 'updated' | 'moved' | 'deleted' | 'restored';
  /** The items it touched; for a delete, what went: the item first, then the items under it. */
  readonly items: readonly OutlineItemRef[];
  readonly origin: EventOrigin;
}

/** The outline was read from the engine, first or again. */
export interface OutlineResyncedEvent {
  readonly outline: DocumentOutline;
}

export interface OutlineCapability {
  /**
   * Every item, depth first, with this session's pending changes shown.
   * Reference-stable until it changes; empty until the first read lands.
   */
  list(): readonly OutlineItem[];
  /** One item, or `null` for a ref the outline doesn't have. */
  get(ref: OutlineItemRef): OutlineItem | null;
  /** An item's children in order; the top level for `null`. Empty for a ref the outline doesn't have. */
  getChildren(parent: OutlineItemRef | null): readonly OutlineItem[];
  /**
   * The rows a tree view shows: every item whose parents are all expanded,
   * depth first, with its depth. Reference-stable until the outline or the
   * expanded items change.
   */
  listRows(): readonly OutlineRow[];
  /**
   * The item for where the main view is reading: the last item, in reading
   * order, that goes to a place at or above the top of the view. `null`
   * before the first such item, and without a stage.
   */
  getCurrentItem(): OutlineItemRef | null;
  /** Part of the outline couldn't be read (a loop in it, or past the read limits); the rest is listed. */
  isIncomplete(): boolean;
  /** Load state: `idle` until `ensureLoaded()` asks, then `loading` → `ready`, or `forbidden` / `error`. */
  getStatus(): ResourceStatus;
  /**
   * Read the outline unless it is read or being read: nothing reads it when a
   * document opens. Resolves once it landed and `onResynced` fired. Rejects
   * `operation-cancelled` or `instance-closed`; after a failure it reads again.
   */
  ensureLoaded(options?: OperationOptions): Promise<void>;
  /** Read it again. Rarely needed: the event stream keeps it current. */
  refresh(options?: OperationOptions): Promise<void>;

  /** Whether an item's children show. */
  isExpanded(ref: OutlineItemRef): boolean;
  /** Show an item's children. */
  expand(ref: OutlineItemRef): void;
  /** Hide an item's children. */
  collapse(ref: OutlineItemRef): void;
  /** Expand a collapsed item, collapse an expanded one. */
  toggle(ref: OutlineItemRef): void;
  /** Expand every item with children. */
  expandAll(): void;
  /** Collapse every item. */
  collapseAll(): void;
  /** Expand every item `ref` sits under, so its row shows. */
  reveal(ref: OutlineItemRef): void;
  /** The selected items, in the order they were selected; refs the outline no longer has drop out. */
  getSelected(): readonly OutlineItemRef[];
  /** Make these items the selection; `[]` clears it. */
  select(refs: readonly OutlineItemRef[]): void;

  /**
   * Follow an item as a click does, and return what happened at once (the
   * user's gesture is still on the stack). An item with an `/A` action runs
   * it through the actions plugin; else its target goes the way a link's
   * does: a page moves the main view, a website opens through the link
   * plugin. Throws `not-found` for a ref the outline doesn't have.
   */
  activate(ref: OutlineItemRef): LinkActivation;

  /** Whether this session may change the outline (`doc.outline.modify`): every write below. */
  canEdit(): boolean;
  /**
   * Where the main view is: the page at its top, the point at its top-left
   * corner, the zoom left as the reader has it. What a new item goes to.
   * `null` without a stage, or before a page is laid out.
   */
  getCurrentViewTarget(): PdfLinkTargetWritable | null;
  /**
   * Add an item. It shows at once and resolves `{ item }` with the engine's
   * item. Its target defaults to `getCurrentViewTarget()`, its title to the
   * selected text, or else "Untitled" in the viewer's language. Fires
   * `onChanged`. Rejects `permission-denied`, `invalid-input` for a title
   * too long or a colour that isn't `#rrggbb`, `not-found` for a parent or a
   * neighbour that isn't there, `operation-cancelled` or `instance-closed`.
   */
  create(
    input?: OutlineItemInput,
    options?: OutlineCreateOptions,
  ): Promise<{ readonly item: OutlineItem }>;
  /**
   * Change the fields the patch names. `target: null` removes the target and
   * `color: null` the colour; `open` holds only on an item with children. It
   * shows at once and resolves `{ item }`. Fires `onChanged`. Rejects as
   * `create` does, and `not-found` for an item that isn't there.
   */
  update(
    ref: OutlineItemRef,
    patch: OutlineItemPatch,
    options?: OperationOptions,
  ): Promise<{ readonly item: OutlineItem }>;
  /**
   * Move items, with the items under them, together and in the order given,
   * to `position` among `parent`'s children (`null`: the top level). It
   * shows at once. Fires `onChanged`. Rejects `permission-denied`,
   * `not-found` for an item, a parent or a neighbour that isn't there,
   * `invalid-input` for a move under itself or an item named with one it
   * holds, `operation-cancelled` or `instance-closed`.
   */
  move(
    refs: readonly OutlineItemRef[],
    parent: OutlineItemRef | null,
    position: OutlinePosition,
    options?: OperationOptions,
  ): Promise<void>;
  /**
   * Delete items, with the items under them, as one change: one step of the
   * history. A named item under another named item goes with it. It shows at
   * once. Fires `onChanged`. Rejects `permission-denied`, `not-found`,
   * `operation-cancelled` or `instance-closed`.
   */
  delete(refs: readonly OutlineItemRef[], options?: OperationOptions): Promise<void>;

  /** A confirmed change, whoever made it. */
  readonly onChanged: EventHook<OutlineChangedEvent>;
  /** The outline was read, first or again. Fires no per-item `onChanged`. */
  readonly onResynced: EventHook<OutlineResyncedEvent>;
}
