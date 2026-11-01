import {
  EngineError,
  EngineErrorCode,
  OUTLINE_READ_LIMITS,
  positionIndex,
  toOutlineItemRef,
  type OutlineCreateResult,
  type OutlineDeleteResult,
  type OutlineItem,
  type OutlineItemDraft,
  type OutlineItemPatch,
  type OutlineItemRef,
  type OutlineMoveResult,
  type OutlineMutationMeta,
  type OutlineOrder,
  type OutlinePosition,
  type OutlineRestoreResult,
  type OutlineUpdateResult,
  type PdfDestination,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { OutlineTree, TOP } from './internal/readOutlineTree';
import { assertWritableFields, writeOutlineFields } from './internal/writeOutlineFields';
import { OutlineReader } from './OutlineReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { withUtf16String } from '../../runtime/memory/strings';

/**
 * Where an item goes, or was: under `parent` ({@link TOP} for the top level),
 * right after `after` (0: first). What an undo of a move puts back.
 */
export interface OutlinePlacement {
  readonly item: number;
  readonly parent: number;
  readonly after: number;
}

/**
 * Synchronous outline writes, shared by the local worker and the server.
 * Each checks everything it can before the first native write, and answers
 * with what it wrote, re-read. The fork keeps the links and `/Count` right
 * (public/epdf_outline.h); what goes where is decided here.
 */
export class OutlineMutator {
  private readonly reader: OutlineReader;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {
    this.reader = new OutlineReader(runtime, session);
  }

  /** The outline's shape as it is now. */
  tree(): OutlineTree {
    return new OutlineTree(this.runtime.fn, this.session.requireDocPtr());
  }

  create(
    parent: OutlineItemRef | null,
    position: OutlinePosition,
    data: OutlineItemDraft<PdfDestination>,
    objectNumber?: number,
  ): OutlineCreateResult<PdfDestination> {
    assertWritableFields(data);
    const tree = this.tree();
    const parentNumber = this.parentNumberOf(tree, parent);
    const children = tree.childrenOf(parentNumber);
    const at = positionIndex(children.map(toOutlineItemRef), position, keyOf);
    const after = at === 0 ? 0 : children[at - 1]!;
    if (objectNumber !== undefined) this.session.claimObjectNumber(objectNumber);

    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const created = withUtf16String(mem, data.title, (title) =>
      fn.EPDFOutline_CreateItem(docPtr, objectNumber ?? 0, parentNumber, after, title),
    );
    if (!created) throw outlineRefused('create the item');
    const { title: _title, ...fields } = data;
    writeOutlineFields(this.runtime, docPtr, created, fields);

    const item = this.reader.readItem(created, parentNumber);
    return {
      item,
      order: this.orderOf(this.tree(), parentNumber),
      meta: this.meta([item.ref]),
    };
  }

  update(
    ref: OutlineItemRef,
    patch: OutlineItemPatch<PdfDestination>,
  ): OutlineUpdateResult<PdfDestination> {
    assertWritableFields(patch);
    const tree = this.tree();
    const parent = this.requireItem(tree, ref, 'ref');
    writeOutlineFields(this.runtime, this.session.requireDocPtr(), ref.objectNumber, patch);
    return {
      item: this.reader.readItem(ref.objectNumber, parent),
      meta: this.meta([ref]),
    };
  }

  /**
   * The items go together, in the order given, under `parent` at `position`
   * among its children; the rules of a reorder (`reorderedList`) hold.
   */
  move(
    refs: readonly OutlineItemRef[],
    parent: OutlineItemRef | null,
    position: OutlinePosition,
  ): OutlineMoveResult {
    const tree = this.tree();
    const items = refs.map((ref) => {
      this.requireItem(tree, ref, 'refs');
      return ref.objectNumber;
    });
    const moving = new Set(items);
    if (moving.size !== items.length) invalid('refs', 'an item is named twice');
    for (const item of items) {
      if (items.some((other) => other !== item && tree.isAtOrUnder(item, other))) {
        invalid('refs', `item ${item} is under another item that moves`);
      }
    }
    const parentNumber = this.parentNumberOf(tree, parent);
    if (items.some((item) => tree.isAtOrUnder(parentNumber, item))) {
      invalid('parent', 'an item would go under itself');
    }
    const staying = tree.childrenOf(parentNumber).filter((child) => !moving.has(child));
    const anchor =
      position === 'start' || position === 'end'
        ? null
        : 'before' in position
          ? position.before
          : position.after;
    if (anchor && moving.has(anchor.objectNumber)) {
      invalid('position', `the neighbour ${anchor.objectNumber} is one of the items that move`);
    }
    const at = positionIndex(staying.map(toOutlineItemRef), position, keyOf);
    let after = at === 0 ? 0 : staying[at - 1]!;
    return this.place(
      items.map((item) => {
        const placement = { item, parent: parentNumber, after };
        after = item;
        return placement;
      }),
      tree,
    );
  }

  /**
   * Puts items where `placements` say, in order: each right after its
   * `after` while that is a child of its parent, else first. What an undo of
   * a move does; the caller has checked that each item and parent is there.
   */
  place(placements: readonly OutlinePlacement[], before = this.tree()): OutlineMoveResult {
    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const parents = new Set<number>();
    for (const { item, parent, after } of placements) {
      parents.add(before.parentOf(item) ?? TOP);
      parents.add(parent);
      const now = this.tree();
      const anchor = after && now.parentOf(after) === parent ? after : 0;
      if (!fn.EPDFOutline_MoveItem(docPtr, item, parent, anchor)) {
        throw outlineRefused(`move item ${item}`);
      }
    }
    const after = this.tree();
    return {
      orders: [...parents].map((parent) => this.orderOf(after, parent)),
      meta: this.meta(placements.map(({ item }) => toOutlineItemRef(item))),
    };
  }

  /** Where `items` are now, in document order: an anchor always comes before what follows it. */
  placementsOf(items: readonly number[], tree = this.tree()): OutlinePlacement[] {
    const wanted = new Set(items);
    return tree
      .items()
      .filter((item) => wanted.has(item))
      .map((item) => {
        const parent = tree.parentOf(item)!;
        const siblings = tree.childrenOf(parent);
        const index = siblings.indexOf(item);
        return { item, parent, after: index > 0 ? siblings[index - 1]! : 0 };
      });
  }

  /** The item goes, with the items under it. */
  delete(ref: OutlineItemRef): OutlineDeleteResult {
    const tree = this.tree();
    this.requireItem(tree, ref, 'ref');
    const going = tree.subtreeOf(ref.objectNumber);
    if (!this.runtime.fn.EPDFOutline_DeleteItem(this.session.requireDocPtr(), ref.objectNumber)) {
      throw outlineRefused(`delete item ${ref.objectNumber}`);
    }
    return { meta: this.meta(going.map(toOutlineItemRef)) };
  }

  /**
   * The items a capture brought back (`importOutlineItem`, run by the
   * caller): the item first, then the items under it, and its parent's
   * children.
   */
  restored(objectNumber: number): OutlineRestoreResult<PdfDestination> {
    const tree = this.tree();
    const parent = tree.parentOf(objectNumber);
    if (parent === undefined) throw outlineRefused(`restore item ${objectNumber}`);
    const items = this.subtree(objectNumber, tree);
    return {
      items,
      order: this.orderOf(tree, parent),
      meta: this.meta(items.map((item) => item.ref)),
    };
  }

  /** The item as it reads now; `null` when the outline has no such item. */
  find(ref: OutlineItemRef, tree = this.tree()): OutlineItem<PdfDestination> | null {
    const parent = tree.parentOf(ref.objectNumber);
    return parent === undefined ? null : this.reader.readItem(ref.objectNumber, parent);
  }

  /** The item and the items under it, depth first, as they read now. */
  subtree(objectNumber: number, tree = this.tree()): OutlineItem<PdfDestination>[] {
    return tree
      .subtreeOf(objectNumber)
      .map((item) => this.reader.readItem(item, tree.parentOf(item)!));
  }

  /** An update's answer for an item written some other way: a revert put it back. */
  updated(ref: OutlineItemRef): OutlineUpdateResult<PdfDestination> {
    const item = this.find(ref);
    if (!item) throw outlineRefused(`read item ${ref.objectNumber}`);
    return { item, meta: this.meta([ref]) };
  }

  /**
   * Counts the items above `ref` again from the tree, as every outline write
   * does: a revert puts back the item's own dictionary, its `/Count` with
   * it, and nothing above it. Setting the open state it reads changes
   * nothing else.
   */
  countAgain(ref: OutlineItemRef): void {
    const item = this.find(ref);
    if (!item) return;
    writeOutlineFields(this.runtime, this.session.requireDocPtr(), ref.objectNumber, {
      open: item.open,
    });
  }

  /**
   * The number a parent ref names: {@link TOP} for `null`; `NotFound` when it
   * isn't an item; `InvalidArg` for an item at the deepest level a read goes
   * to, whose children no read shows.
   */
  private parentNumberOf(tree: OutlineTree, parent: OutlineItemRef | null): number {
    if (parent === null) return TOP;
    this.requireItem(tree, parent, 'parent');
    if ((tree.levelOf(parent.objectNumber) ?? 0) >= OUTLINE_READ_LIMITS.depth - 1) {
      invalid('parent', `an item under ${parent.objectNumber} would be deeper than reads go`);
    }
    return parent.objectNumber;
  }

  /** The item's parent; `NotFound` when the outline has no such item. */
  private requireItem(tree: OutlineTree, ref: OutlineItemRef, field: string): number {
    const parent = tree.parentOf(ref.objectNumber);
    if (parent === undefined) {
      throw new EngineError(EngineErrorCode.NotFound, `no outline item ${ref.objectNumber}`, {
        details: { field },
      });
    }
    return parent;
  }

  private orderOf(tree: OutlineTree, parent: number): OutlineOrder {
    return {
      parent: parent === TOP ? null : toOutlineItemRef(parent),
      children: tree.childrenOf(parent).map(toOutlineItemRef),
    };
  }

  private meta(changed: OutlineItemRef[]): OutlineMutationMeta {
    return { affectedPages: [], cacheDelta: null, ...this.session.writeStamp(), changed };
  }
}

const keyOf = (ref: OutlineItemRef) => String(ref.objectNumber);

function invalid(field: string, message: string): never {
  throw new EngineError(EngineErrorCode.InvalidArg, message, { details: { field } });
}

/**
 * The fork refused a write the checks above let through: a list it would
 * change holds an item that isn't an indirect object, or `/Root /Outlines`
 * is a direct dictionary.
 */
function outlineRefused(what: string): EngineError {
  return new EngineError(
    EngineErrorCode.MalformedPdf,
    `could not ${what}: the outline holds an item that isn't an indirect object`,
  );
}
