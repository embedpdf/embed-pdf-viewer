import {
  pageRefsEqual,
  type OutlineItem,
  type OutlineItemDraft,
  type OutlineItemRef,
  type PageRef,
} from '@embedpdf/engine';

type WritableTarget = NonNullable<OutlineItemDraft['target']>;

/** One bookmark to make in the merged file, under the copy of `parent` (`null`: the top). */
export interface OutlineCopyStep {
  readonly source: OutlineItemRef;
  readonly parent: OutlineItemRef | null;
  readonly draft: OutlineItemDraft;
}

const PAGE_TURNS = new Set(['NextPage', 'PrevPage', 'FirstPage', 'LastPage']);

/**
 * Where a copied bookmark goes: the same place on the page its file's page became. A target a
 * bookmark can't be written with (a script, another file) leaves the bookmark as a title only,
 * so the tree keeps its shape. `undefined`: it goes to a page that wasn't merged.
 */
function copiedTarget(
  target: OutlineItem['target'],
  sourcePages: readonly PageRef[],
  insertedPages: readonly PageRef[],
): WritableTarget | null | undefined {
  if (!target) return null;
  if (target.kind === 'uri') return target;
  if (target.kind === 'named') {
    return PAGE_TURNS.has(target.name) ? (target as WritableTarget) : null;
  }
  if (target.kind !== 'goto') return null;
  const index = sourcePages.findIndex((page) => pageRefsEqual(page, target.destination.page));
  const page = insertedPages[index];
  return page ? { kind: 'goto', destination: { ...target.destination, page } } : undefined;
}

/**
 * A file's bookmarks, as the steps that make them again in the merged file. Inserting pages
 * brings their annotations but not the bookmarks pointing at them, so the merge copies them.
 * `sourcePages` are the file's pages that were merged, in the order `insertedPages` holds their
 * copies. A bookmark to a page that wasn't merged goes, unless bookmarks under it stay: then it
 * stays as their heading, a title only. The outline is listed parent first, so each step's parent
 * is made before it.
 */
export function outlineCopy(
  items: readonly OutlineItem[],
  sourcePages: readonly PageRef[],
  insertedPages: readonly PageRef[],
): OutlineCopyStep[] {
  const targets = items.map((item) => copiedTarget(item.target, sourcePages, insertedPages));
  // Children come after their parent, so walking back up decides every child first.
  const kept = new Set<number>();
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]!;
    if (targets[index] === undefined && !kept.has(item.ref.objectNumber)) continue;
    kept.add(item.ref.objectNumber);
    if (item.parent) kept.add(item.parent.objectNumber);
  }
  return items.flatMap((item, index) => {
    if (!kept.has(item.ref.objectNumber)) return [];
    const target = targets[index];
    return [
      {
        source: item.ref,
        parent: item.parent,
        draft: {
          title: item.title,
          ...(target ? { target } : {}),
          ...(item.color ? { color: item.color } : {}),
          ...(item.bold ? { bold: true } : {}),
          ...(item.italic ? { italic: true } : {}),
        },
      },
    ];
  });
}
