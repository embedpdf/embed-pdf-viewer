/**
 * The keyboard of a tree view, as the ARIA tree pattern has it — pure.
 * A view hands in the rows that show (in order, each with its depth, whether
 * it has children and whether they show), the focused row and the key
 * (`KeyboardEvent.key`); it gets back what the key does, and does it. A key
 * that does nothing returns `null`, so the view lets the event go on.
 *
 *   ArrowDown, ArrowUp   the next, the previous row
 *   ArrowRight           a collapsed parent expands; an expanded one moves to its first child
 *   ArrowLeft            an expanded parent collapses; any other row moves to its parent
 *   Home, End            the first, the last row
 *   *                    every collapsed sibling of the focused row expands
 *   Enter                the row activates
 *   F2, Delete           the row is renamed or deleted, when the tree is editable
 */

/** A row as the keyboard sees it. */
export interface TreeKeyRow {
  /** How deep it sits: 0 at the top level. */
  readonly depth: number;
  readonly hasChildren: boolean;
  /** Whether its children show. */
  readonly expanded: boolean;
}

/** What a key does, naming rows by their index in the rows handed in. */
export type TreeKeyAction =
  | { readonly type: 'focus'; readonly row: number }
  | { readonly type: 'expand'; readonly rows: readonly number[] }
  | { readonly type: 'collapse'; readonly row: number }
  | { readonly type: 'activate'; readonly row: number }
  | { readonly type: 'rename'; readonly row: number }
  | { readonly type: 'delete'; readonly row: number };

export interface TreeKeyOptions {
  /** Whether F2 and Delete edit the tree. Off by default: a reader's tree only moves and opens. */
  readonly editable?: boolean;
}

/** The row `row` sits under: the nearest one above it that is one level up, or -1 at the top. */
function parentOf(rows: readonly TreeKeyRow[], row: number): number {
  const depth = rows[row]!.depth;
  for (let i = row - 1; i >= 0; i -= 1) if (rows[i]!.depth < depth) return i;
  return -1;
}

/** The rows that share `row`'s parent, `row` among them, in order. */
function siblingsOf(rows: readonly TreeKeyRow[], row: number): number[] {
  const depth = rows[row]!.depth;
  const siblings: number[] = [];
  for (let i = parentOf(rows, row) + 1; i < rows.length; i += 1) {
    if (rows[i]!.depth < depth) break;
    if (rows[i]!.depth === depth) siblings.push(i);
  }
  return siblings;
}

export function treeKeyAction(
  rows: readonly TreeKeyRow[],
  focused: number,
  key: string,
  options: TreeKeyOptions = {},
): TreeKeyAction | null {
  if (rows.length === 0) return null;
  const last = rows.length - 1;
  // Without a focused row, the keys that move pick a first one.
  if (focused < 0 || focused > last) {
    if (key === 'ArrowDown' || key === 'Home') return { type: 'focus', row: 0 };
    if (key === 'ArrowUp' || key === 'End') return { type: 'focus', row: last };
    return null;
  }
  const current = rows[focused]!;
  const focus = (row: number): TreeKeyAction | null =>
    row === focused ? null : { type: 'focus', row };
  switch (key) {
    case 'ArrowDown':
      return focus(Math.min(focused + 1, last));
    case 'ArrowUp':
      return focus(Math.max(focused - 1, 0));
    case 'Home':
      return focus(0);
    case 'End':
      return focus(last);
    case 'ArrowRight':
      if (!current.hasChildren) return null;
      return current.expanded ? focus(focused + 1) : { type: 'expand', rows: [focused] };
    case 'ArrowLeft': {
      if (current.hasChildren && current.expanded) return { type: 'collapse', row: focused };
      const parent = parentOf(rows, focused);
      return parent < 0 ? null : focus(parent);
    }
    case '*': {
      const collapsed = siblingsOf(rows, focused).filter(
        (row) => rows[row]!.hasChildren && !rows[row]!.expanded,
      );
      return collapsed.length > 0 ? { type: 'expand', rows: collapsed } : null;
    }
    case 'Enter':
      return { type: 'activate', row: focused };
    case 'F2':
      return options.editable ? { type: 'rename', row: focused } : null;
    case 'Delete':
      return options.editable ? { type: 'delete', row: focused } : null;
    default:
      return null;
  }
}
