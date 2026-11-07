/**
 * What an outline write leaves, worked out before the engine runs it: an
 * item as a read of it returns it afterwards. The engine's rules as plain
 * functions, so a viewer can show a write at once and the engine follows the
 * same rules (`runOutlineConformance` checks them on both engines). Where the
 * items go among their parent's children follows `positionIndex` and
 * `reorderedList`.
 */
import type { OutlineItem, OutlineItemDraft, OutlineItemPatch } from '../dto/DocumentOutline';
import type { PageDestination } from '../dto/PdfDestination';
import { actionTreeOf, type PdfLinkTargetWritable } from '../dto/PdfLinkTarget';
import type { OutlineItemRef } from '../identity/OutlineItemRef';

/** A target as a read returns it: the target, and the `/A` action it is written as. */
function targetFieldsOf<D>(
  target: PdfLinkTargetWritable<D> | null,
): Pick<OutlineItem<D>, 'target' | 'action'> {
  return target ? { target, action: actionTreeOf(target) } : { target: null, action: null };
}

/** A colour as a read returns it: `#rrggbb` in lowercase digits, or `null`. */
const colorAsRead = (color: string | null | undefined): string | null =>
  color ? color.toLowerCase() : null;

/** `outline.create`: the new item. It has no children yet, so it isn't open. */
export function outlineItemOfDraft<D = PageDestination>(
  ref: OutlineItemRef,
  parent: OutlineItemRef | null,
  draft: OutlineItemDraft<D>,
): OutlineItem<D> {
  return {
    ref,
    parent,
    title: draft.title,
    ...targetFieldsOf(draft.target ?? null),
    open: false,
    color: colorAsRead(draft.color),
    bold: draft.bold ?? false,
    italic: draft.italic ?? false,
  };
}

/**
 * `outline.update`: the item with the fields the patch names. `open` holds
 * only on an item with children (`hasChildren`): a leaf has no open state.
 * Returns `item` itself when the patch changes nothing.
 */
export function outlineItemAfter<D = PageDestination>(
  item: OutlineItem<D>,
  patch: OutlineItemPatch<D>,
  hasChildren: boolean,
): OutlineItem<D> {
  const next: OutlineItem<D> = {
    ...item,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.target !== undefined ? targetFieldsOf(patch.target) : {}),
    ...(patch.color !== undefined ? { color: colorAsRead(patch.color) } : {}),
    ...(patch.bold !== undefined ? { bold: patch.bold } : {}),
    ...(patch.italic !== undefined ? { italic: patch.italic } : {}),
    ...(patch.open !== undefined ? { open: patch.open && hasChildren } : {}),
  };
  const same =
    patch.target === undefined &&
    next.title === item.title &&
    next.color === item.color &&
    next.bold === item.bold &&
    next.italic === item.italic &&
    next.open === item.open;
  return same ? item : next;
}

/**
 * An item whose children a write changed: one left without children is no
 * longer open, and one that gains its first child stays closed, as a leaf
 * is. Returns `item` itself when that changes nothing.
 */
export function outlineItemWithChildren<D = PageDestination>(
  item: OutlineItem<D>,
  hasChildren: boolean,
): OutlineItem<D> {
  return item.open && !hasChildren ? { ...item, open: false } : item;
}
