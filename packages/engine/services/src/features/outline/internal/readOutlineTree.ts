import { OUTLINE_READ_LIMITS } from '@embedpdf/engine-core/runtime';
import { NULL_PTR, type PdfFunctions, type Ptr } from '@embedpdf/engine-runtime';

/** The top level, as a parent: the outline's own dictionary. */
export const TOP = 0;

/**
 * The outline's shape as the document links it now, by object number: each
 * item's parent ({@link TOP} for a top-level item) and each parent's
 * children in order. Only what a write needs: no titles, no targets. An item
 * that isn't an indirect object is left out with the items under it, a loop
 * ends its list, and items deeper than a read goes aren't in it, as every
 * read of the outline does.
 */
export class OutlineTree {
  private readonly childrenByParent = new Map<number, number[]>();
  private readonly parentByItem = new Map<number, number>();

  constructor(fn: PdfFunctions, docPtr: Ptr) {
    const visit = (parentHandle: Ptr, parent: number, depth: number) => {
      if (depth >= OUTLINE_READ_LIMITS.depth) return;
      const children: number[] = [];
      this.childrenByParent.set(parent, children);
      for (
        let handle = fn.FPDFBookmark_GetFirstChild(docPtr, parentHandle);
        handle;
        handle = fn.FPDFBookmark_GetNextSibling(docPtr, handle)
      ) {
        const item = fn.EPDFOutline_GetObjectNumber(handle);
        if (!item) continue;
        if (this.parentByItem.has(item)) break;
        this.parentByItem.set(item, parent);
        children.push(item);
        visit(handle, item, depth + 1);
      }
    };
    visit(NULL_PTR, TOP, 0);
  }

  has(item: number): boolean {
    return this.parentByItem.has(item);
  }

  /** The item's parent ({@link TOP} at the top level); `undefined` when it isn't in the outline. */
  parentOf(item: number): number | undefined {
    return this.parentByItem.get(item);
  }

  /** A parent's children in order: none for a leaf, or an item the outline doesn't have. */
  childrenOf(parent: number): readonly number[] {
    return this.childrenByParent.get(parent) ?? [];
  }

  /** The item and the items under it, depth first: the item first. */
  subtreeOf(item: number): number[] {
    const items = [item];
    for (const child of this.childrenOf(item)) items.push(...this.subtreeOf(child));
    return items;
  }

  /** Whether `node` is `item` or one of the items under it. */
  isAtOrUnder(node: number, item: number): boolean {
    for (let current: number | undefined = node; current; current = this.parentOf(current)) {
      if (current === item) return true;
    }
    return false;
  }

  /** Every item, depth first: what an order of the whole outline is. */
  items(): number[] {
    return this.childrenOf(TOP).flatMap((item) => this.subtreeOf(item));
  }
}
