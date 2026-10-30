/**
 * The outline panel: the document's outline (its bookmarks) as a tree. A row goes where its item
 * goes; the row of the item the main view is reading is marked, and comes into view as the
 * reader moves on. The filter in the panel's bar (`outline` in the layout, with add, expand all
 * and collapse all) finds items by their title, in their place. A session that may change the
 * outline adds items (after the selected one, at the place in view, renaming them at once),
 * renames, drags and deletes them, and opens a row's menu for the rest.
 */
import { useCommand } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import {
  useOutline,
  useOutlineState,
  type OutlineItem,
  type OutlineItemRef,
} from '@embedpdf/react/outline';
import { useSurface } from '@embedpdf/react/shell';
import { useEffect, useMemo, useState } from 'react';

import { useOutlineFilter } from './outline-filter';
import { OutlineRows } from './outline-rows';
import { filteredRows, outlineKeyOf } from './outline-tree';
import { useCloseOnPick } from './panel-frame';
import { useTheme } from './theme';
import { OUTLINE_RENAME } from '../config/outline';

/** The rename request's props: an item to rename, or the selection an add is about to replace. */
type RenameRequest = { readonly item?: number; readonly after?: number | null };

/**
 * The row to mark for where the reader is: the current item's own when it shows, else that of
 * the nearest item it sits under that does.
 */
function shownKeyOf(
  current: OutlineItemRef | null,
  shown: ReadonlySet<string>,
  items: readonly OutlineItem[],
): string | null {
  if (!current) return null;
  const byKey = new Map(items.map((item) => [outlineKeyOf(item.ref), item]));
  for (let key: string | null = outlineKeyOf(current); key !== null; ) {
    if (shown.has(key)) return key;
    const parent: OutlineItemRef | null = byKey.get(key)?.parent ?? null;
    key = parent ? outlineKeyOf(parent) : null;
  }
  return null;
}

export function OutlinePanel() {
  const t = useT();
  const outline = useOutline();
  const { items, rows, current, selected, status, incomplete } = useOutlineState();
  const { mode } = useTheme();
  const closeOnPick = useCloseOnPick();
  const add = useCommand('outline:add');
  const editable = add.visible && add.enabled;
  const [filter, setFilter] = useOutlineFilter();
  const [renamingKey, setRenamingKey] = useState<string | null>(null);

  const filtering = filter.trim() !== '';
  const shownRows = useMemo(
    () => (filtering ? filteredRows(items, filter) : rows),
    [filtering, items, filter, rows],
  );
  const shownKeys = useMemo(
    () => new Set(shownRows.map((row) => outlineKeyOf(row.item.ref))),
    [shownRows],
  );
  const currentKey = shownKeyOf(current, shownKeys, items);

  // A rename asked for by a command: the item it names, or the one an add selects.
  const renameRequest = useSurface(OUTLINE_RENAME);
  useEffect(() => {
    if (!renameRequest.isOpen) return;
    const request = renameRequest.props as RenameRequest;
    if (request.item !== undefined) {
      setRenamingKey(String(request.item));
      renameRequest.close();
      return;
    }
    const [first] = selected;
    if (!first || first.objectNumber === request.after) return;
    setFilter('');
    setRenamingKey(outlineKeyOf(first));
    renameRequest.close();
  }, [renameRequest, selected, setFilter]);

  const message = (text: string, withAdd = false) => (
    <div className="text-fg-muted flex flex-col items-center gap-3 p-6 text-center text-sm">
      <p>{text}</p>
      {withAdd && editable && (
        <button
          type="button"
          onClick={() => void add.run()}
          className="border-border text-fg hover:bg-hover rounded-md border px-3 py-1.5 text-sm"
        >
          {add.label}
        </button>
      )}
    </div>
  );

  const body = (() => {
    if (items.length === 0) {
      if (status === 'idle' || status === 'loading') return message(t('outline.loading'));
      if (status === 'forbidden' || status === 'error') return message(t('outline.failed'));
      return message(t('outline.empty'), true);
    }
    if (filtering && shownRows.length === 0) return message(t('outline.noMatches'));
    return (
      <OutlineRows
        outline={outline}
        rows={shownRows}
        currentKey={currentKey}
        selected={selected}
        editable={editable}
        filtering={filtering}
        renamingKey={renamingKey}
        onRename={setRenamingKey}
        mode={mode}
        onPicked={closeOnPick}
        label={t('panels.outline')}
      />
    );
  })();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {incomplete && (
        <p className="text-fg-muted border-border-subtle border-b px-3 py-2 text-xs">
          {t('outline.incomplete')}
        </p>
      )}
      {body}
    </div>
  );
}
