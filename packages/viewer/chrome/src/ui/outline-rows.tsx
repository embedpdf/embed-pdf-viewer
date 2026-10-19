/**
 * The outline's rows: a tree that draws only the rows in view (every row is one height), with
 * the keyboard of the ARIA tree pattern (`treeKeyAction`), renaming in the row, and dragging rows
 * to another place, the pointer's distance from the edge choosing how deep. A pen or a finger
 * holds a row first, so a swipe still scrolls the list.
 */
import { treeKeyAction, type TreeKeyAction } from '@embedpdf/core-ui';
import { useCommand } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import type { OutlineCapability, OutlineItemRef, OutlineRow } from '@embedpdf/react/outline';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Icon } from './icons';
import {
  OUTLINE_INDENT,
  OUTLINE_ROW_HEIGHT,
  dropOf,
  movingKeysOf,
  outlineKeyOf,
  readableColor,
  type OutlineDrop,
} from './outline-tree';
import { CommandButton } from './toolbar';

/** Rows drawn past each edge of the view, so a scroll shows no gap before the next frame. */
const OVERSCAN = 8;
/** How far the pointer moves before a press on a row becomes a drag, in px. */
const DRAG_SLOP_PX = 4;
/** How long a pen or a finger holds a row before it drags it, in ms. */
const HOLD_MS = 450;
/** Within this many px of the list's top or bottom, a drag scrolls the list. */
const EDGE_PX = 28;
/** The text of a row is drawn at this size, in px. */
const TEXT_PX = 13;
/** A text field below this size makes iOS zoom the page as it takes focus. */
const FIELD_PX = 16;

export interface OutlineRowsProps {
  readonly outline: OutlineCapability;
  readonly rows: readonly OutlineRow[];
  /** The row that shows where the main view is reading: the current item, or its shown parent. */
  readonly currentKey: string | null;
  readonly selected: readonly OutlineItemRef[];
  /** Whether the rows can be renamed, dragged and deleted. */
  readonly editable: boolean;
  /** Rows show as found by a filter: none of them folds, and none drags. */
  readonly filtering: boolean;
  readonly renamingKey: string | null;
  readonly onRename: (key: string | null) => void;
  readonly mode: 'light' | 'dark';
  /** An item was followed: the panel closes when it covers the pages. */
  readonly onPicked: () => void;
  readonly label: string;
}

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** The level of the row the drag started on: a drag straight down keeps it. */
  readonly startDepth: number;
  /** The rows that move, by key, and the refs to move, in outline order. */
  readonly moving: ReadonlySet<string>;
  readonly refs: readonly OutlineItemRef[];
  readonly active: boolean;
  readonly drop: (OutlineDrop & { readonly gap: number }) | null;
}

export function OutlineRows(props: OutlineRowsProps) {
  const { outline, rows, currentKey, selected, editable, filtering, renamingKey, onRename } = props;
  const t = useT();
  const idPrefix = useId();
  const list = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [anchorKey, setAnchorKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  // The focused row is marked only while the keyboard works the tree, not after a click.
  const [treeFocused, setTreeFocused] = useState(false);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const selectedKeys = new Set(selected.map(outlineKeyOf));
  const indexOfKey = (key: string | null) =>
    key === null ? -1 : rows.findIndex((row) => outlineKeyOf(row.item.ref) === key);

  // The keyboard starts where the reader is, else at the selection, else at the top.
  const focused =
    indexOfKey(focusedKey) >= 0
      ? focusedKey
      : (currentKey ?? (selected[0] ? outlineKeyOf(selected[0]) : null));
  const focusedIndex = indexOfKey(focused);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  /** Scroll so a row shows, moving no more than it takes. */
  const reveal = (index: number) => {
    const element = list.current;
    if (!element || index < 0) return;
    const top = index * OUTLINE_ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (top + OUTLINE_ROW_HEIGHT > element.scrollTop + element.clientHeight) {
      element.scrollTop = top + OUTLINE_ROW_HEIGHT - element.clientHeight;
    }
  };

  // The reading position moved: its row comes into view.
  const currentIndex = indexOfKey(currentKey);
  useEffect(() => reveal(currentIndex), [currentIndex]);
  // A rename starts on a row that may be scrolled away, such as one an add just made.
  const renamingIndex = indexOfKey(renamingKey);
  useEffect(() => reveal(renamingIndex), [renamingIndex]);

  const first = Math.max(0, Math.floor(scrollTop / OUTLINE_ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    rows.length,
    Math.ceil((scrollTop + height) / OUTLINE_ROW_HEIGHT) + OVERSCAN,
  );

  const follow = (row: OutlineRow) => {
    const { item } = row;
    if (!item.target && !item.action) return;
    outline.activate(item.ref);
    props.onPicked();
  };

  const focusRow = (index: number, select: boolean) => {
    const row = rows[index];
    if (!row) return;
    const key = outlineKeyOf(row.item.ref);
    setFocusedKey(key);
    if (select) {
      setAnchorKey(key);
      outline.select([row.item.ref]);
    }
    reveal(index);
  };

  const run = (action: TreeKeyAction) => {
    switch (action.type) {
      case 'focus':
        focusRow(action.row, true);
        return;
      case 'expand':
        for (const index of action.rows) {
          const row = rows[index];
          if (row) outline.expand(row.item.ref);
        }
        return;
      case 'collapse': {
        const row = rows[action.row];
        if (row) outline.collapse(row.item.ref);
        return;
      }
      case 'activate': {
        const row = rows[action.row];
        if (row) follow(row);
        return;
      }
      case 'rename': {
        const row = rows[action.row];
        if (row) onRename(outlineKeyOf(row.item.ref));
        return;
      }
      case 'delete':
        if (selected.length > 0) void outline.delete(selected).catch(() => {});
        return;
    }
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    setTreeFocused(true);
    // Backspace is the Delete key of a Mac keyboard.
    const key = event.key === 'Backspace' ? 'Delete' : event.key;
    const action = treeKeyAction(rows, focusedIndex, key, { editable });
    // A filter shows every parent open: there is nothing to fold.
    if (!action || (filtering && (action.type === 'expand' || action.type === 'collapse'))) {
      return;
    }
    event.preventDefault();
    run(action);
  };

  const onRowClick = (row: OutlineRow, index: number, event: ReactMouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const key = outlineKeyOf(row.item.ref);
    setFocusedKey(key);
    if (event.metaKey || event.ctrlKey) {
      // Cmd or Ctrl adds the row to the selection, or takes it out.
      outline.select(
        selectedKeys.has(key)
          ? selected.filter((ref) => outlineKeyOf(ref) !== key)
          : [...selected, row.item.ref],
      );
      setAnchorKey(key);
      return;
    }
    if (event.shiftKey && anchorKey !== null && indexOfKey(anchorKey) >= 0) {
      // Shift selects every row from the last one picked to this one.
      const from = indexOfKey(anchorKey);
      const [low, high] = from < index ? [from, index] : [index, from];
      outline.select(rows.slice(low, high + 1).map((each) => each.item.ref));
      return;
    }
    setAnchorKey(key);
    outline.select([row.item.ref]);
    follow(row);
  };

  // ── dragging ──────────────────────────────────────────────────────────────

  const stopHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  /** Where the pointer drops what's dragged, from where it is over the list. */
  const dropAt = (current: Drag, clientX: number, clientY: number): Drag['drop'] => {
    const element = list.current;
    if (!element) return null;
    const box = element.getBoundingClientRect();
    const y = clientY - box.top + element.scrollTop;
    const gap = Math.max(0, Math.min(rows.length, Math.round(y / OUTLINE_ROW_HEIGHT)));
    // Each indent the pointer moves toward the line's end goes a level deeper, back a level shallower.
    const rtl = getComputedStyle(element).direction === 'rtl';
    const across = (clientX - current.startX) * (rtl ? -1 : 1);
    const drop = dropOf(rows, current.moving, gap, current.startDepth + across / OUTLINE_INDENT);
    return drop ? { ...drop, gap } : null;
  };

  const startDrag = (current: Drag, clientX: number, clientY: number) => {
    const next = { ...current, active: true, drop: dropAt(current, clientX, clientY) };
    setDrag(next);
    list.current?.setPointerCapture(current.pointerId);
  };

  const onPointerDown = (row: OutlineRow, event: ReactPointerEvent) => {
    if (!editable || filtering || event.button !== 0 || renamingKey !== null) return;
    if ((event.target as HTMLElement).closest('button, input')) return;
    const key = outlineKeyOf(row.item.ref);
    // A selected row drags the whole selection with it; any other row drags alone.
    const dragged = selectedKeys.has(key) ? selectedKeys : new Set([key]);
    const moving = movingKeysOf(rows, dragged);
    const refs = rows
      .filter((each) => dragged.has(outlineKeyOf(each.item.ref)))
      .filter((each) => {
        // An item under another dragged one goes with it: name only the topmost.
        const keyOf = outlineKeyOf(each.item.ref);
        const parent = each.item.parent ? outlineKeyOf(each.item.parent) : null;
        return !(parent !== null && moving.has(parent) && moving.has(keyOf));
      })
      .map((each) => each.item.ref);
    const pending: Drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startDepth: row.depth,
      moving,
      refs,
      active: false,
      drop: null,
    };
    setDrag(pending);
    if (event.pointerType !== 'mouse') {
      const { clientX, clientY } = event;
      holdTimer.current = setTimeout(() => {
        const current = dragRef.current;
        if (current && !current.active) startDrag(current, clientX, clientY);
      }, HOLD_MS);
    }
  };

  // While a finger drags, the list must not scroll under it.
  const dragging = drag?.active === true;
  useEffect(() => {
    if (!dragging) return;
    const prevent = (event: TouchEvent) => event.preventDefault();
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => document.removeEventListener('touchmove', prevent);
  }, [dragging]);

  const onPointerMove = (event: ReactPointerEvent) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
    if (!current.active) {
      if (moved <= DRAG_SLOP_PX) return;
      if (event.pointerType === 'mouse') startDrag(current, event.clientX, event.clientY);
      else {
        // A finger that moves before the hold is up scrolls the list.
        stopHold();
        setDrag(null);
      }
      return;
    }
    const element = list.current;
    if (element) {
      const box = element.getBoundingClientRect();
      if (event.clientY < box.top + EDGE_PX) element.scrollTop -= 8;
      else if (event.clientY > box.bottom - EDGE_PX) element.scrollTop += 8;
    }
    setDrag({ ...current, drop: dropAt(current, event.clientX, event.clientY) });
  };

  const endDrag = (event: ReactPointerEvent, commit: boolean) => {
    stopHold();
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    setDrag(null);
    if (!current.active) return;
    // The click a drag ends with is not a click on a row. None comes when the drag ends off
    // the row it began on, so the flag lasts only until this event is done.
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (commit && current.drop && current.refs.length > 0) {
      void outline.move(current.refs, current.drop.parent, current.drop.position).catch(() => {});
    }
  };

  useEffect(() => stopHold, []);

  const shown = rows.slice(first, last);
  return (
    <div
      ref={list}
      role="tree"
      aria-label={props.label}
      aria-multiselectable={true}
      tabIndex={0}
      aria-activedescendant={focusedIndex >= 0 ? `${idPrefix}-${focused}` : undefined}
      onKeyDown={onKeyDown}
      onFocus={(event) =>
        event.target === event.currentTarget &&
        setTreeFocused(event.currentTarget.matches(':focus-visible'))
      }
      onBlur={(event) => event.target === event.currentTarget && setTreeFocused(false)}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => endDrag(event, true)}
      onPointerCancel={(event) => endDrag(event, false)}
      className="focus-visible:ring-accent relative min-h-0 flex-1 overflow-y-auto outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <div style={{ height: rows.length * OUTLINE_ROW_HEIGHT, position: 'relative' }}>
        {shown.map((row, offset) => {
          const index = first + offset;
          const key = outlineKeyOf(row.item.ref);
          return (
            <Row
              key={key}
              id={`${idPrefix}-${key}`}
              outline={outline}
              row={row}
              index={index}
              current={key === currentKey}
              selected={selectedKeys.has(key)}
              focused={treeFocused && key === focused}
              moving={dragging && drag.moving.has(key)}
              editable={editable}
              foldable={!filtering}
              renaming={key === renamingKey}
              mode={props.mode}
              untitled={t('outline.untitled')}
              onClick={(event) => onRowClick(row, index, event)}
              onPointerDown={(event) => onPointerDown(row, event)}
              onRenameStart={() => onRename(key)}
              onRenameEnd={() => {
                // The keyboard goes back to the tree, on the row just renamed.
                onRename(null);
                setFocusedKey(key);
                list.current?.focus({ preventScroll: true });
              }}
              onMenu={() => {
                setFocusedKey(key);
                if (!selectedKeys.has(key)) outline.select([row.item.ref]);
              }}
            />
          );
        })}
        {dragging && drag.drop && (
          <div
            aria-hidden
            className="bg-accent pointer-events-none absolute h-0.5 rounded-full"
            style={{
              top: drag.drop.gap * OUTLINE_ROW_HEIGHT - 1,
              insetInlineStart: 4 + 20 + drag.drop.depth * OUTLINE_INDENT,
              insetInlineEnd: 4,
            }}
          />
        )}
      </div>
    </div>
  );
}

interface RowProps {
  readonly id: string;
  readonly outline: OutlineCapability;
  readonly row: OutlineRow;
  readonly index: number;
  readonly current: boolean;
  readonly selected: boolean;
  readonly focused: boolean;
  readonly moving: boolean;
  readonly editable: boolean;
  readonly foldable: boolean;
  readonly renaming: boolean;
  readonly mode: 'light' | 'dark';
  readonly untitled: string;
  readonly onClick: (event: ReactMouseEvent) => void;
  readonly onPointerDown: (event: ReactPointerEvent) => void;
  readonly onRenameStart: () => void;
  readonly onRenameEnd: () => void;
  /** The row's menu is about to open: the row becomes the selection. */
  readonly onMenu: () => void;
}

function Row(props: RowProps) {
  const { row, outline } = props;
  const { item, depth, hasChildren, expanded } = row;
  const menuButton = useRef<HTMLSpanElement>(null);
  // An item that goes nowhere and runs nothing is drawn faint: a heading of the outline.
  const inert = !item.target && !item.action;
  const color = readableColor(item.color, props.mode);
  const tone = props.selected
    ? 'bg-accent-light text-fg'
    : props.current
      ? 'bg-hover text-fg'
      : 'text-fg-secondary hover:bg-hover';
  return (
    <div
      id={props.id}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? expanded : undefined}
      aria-selected={props.selected}
      aria-current={props.current ? 'location' : undefined}
      onClick={props.onClick}
      onDoubleClick={() => props.editable && props.onRenameStart()}
      onContextMenu={(event) => {
        if (!props.editable) return;
        event.preventDefault();
        props.onMenu();
        menuButton.current?.querySelector('button')?.click();
      }}
      onPointerDown={props.onPointerDown}
      className={`group absolute inset-x-0 flex cursor-default select-none items-center gap-0.5 rounded pe-1 ${tone} ${
        props.focused ? 'ring-accent/60 ring-1 ring-inset' : ''
      } ${props.moving ? 'opacity-40' : ''}`}
      style={{
        top: props.index * OUTLINE_ROW_HEIGHT,
        height: OUTLINE_ROW_HEIGHT,
        paddingInlineStart: 4 + depth * OUTLINE_INDENT,
      }}
    >
      {props.current && (
        <span aria-hidden className="bg-accent absolute inset-y-1 start-0 w-0.5 rounded-full" />
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={!hasChildren || !props.foldable}
        onClick={(event) => {
          event.stopPropagation();
          if (expanded) outline.collapse(item.ref);
          else outline.expand(item.ref);
        }}
        className="text-fg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded disabled:cursor-default"
      >
        {hasChildren && (
          <Icon
            name="chevronRight"
            size={14}
            className={`transition-transform rtl:-scale-x-100 ${expanded ? 'rotate-90 rtl:-rotate-90' : ''}`}
          />
        )}
      </button>
      {props.renaming ? (
        <RenameField
          title={item.title}
          onDone={(title) => {
            props.onRenameEnd();
            if (title !== null && title !== item.title) {
              void outline.update(item.ref, { title }).catch(() => {});
            }
          }}
        />
      ) : (
        <span
          className={`min-w-0 flex-1 truncate ${inert ? 'opacity-60' : ''}`}
          style={{
            fontSize: TEXT_PX,
            color: color ?? undefined,
            fontWeight: item.bold ? 600 : undefined,
            fontStyle: item.italic ? 'italic' : undefined,
          }}
          title={item.title || props.untitled}
        >
          {item.title || props.untitled}
        </span>
      )}
      {props.editable && !props.renaming && (
        <span
          ref={menuButton}
          onClick={(event) => event.stopPropagation()}
          onPointerDownCapture={props.onMenu}
          className={`shrink-0 ${props.selected || props.focused ? '' : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'}`}
        >
          <RowMenuButton />
        </span>
      )}
    </div>
  );
}

/** The row's menu button: the outline's commands for the selected row. */
function RowMenuButton() {
  const more = useCommand('menu:outline-item');
  if (!more.visible) return null;
  return <CommandButton cmd={more} variant="icon" run={() => void more.run()} />;
}

/**
 * The title being typed in its row: Enter or leaving the field keeps it, Escape keeps the one it
 * had. The field is laid out at 16px and drawn at the row's size, so iOS doesn't zoom in on it.
 */
function RenameField({ title, onDone }: { title: string; onDone: (title: string | null) => void }) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const [draft, setDraft] = useState(title);
  useLayoutEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  const scale = TEXT_PX / FIELD_PX;
  return (
    <span className="relative min-w-0 flex-1" style={{ height: OUTLINE_ROW_HEIGHT - 6 }}>
      <input
        ref={field}
        type="text"
        value={draft}
        aria-label={t('commands.outline.rename')}
        maxLength={32_767}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') finish(draft);
          else if (event.key === 'Escape') finish(null);
        }}
        onBlur={() => finish(draft)}
        onClick={(event) => event.stopPropagation()}
        className="border-accent bg-surface text-fg absolute start-0 top-0 origin-top-left rounded border px-1 outline-none rtl:origin-top-right"
        style={{
          fontSize: FIELD_PX,
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
          transform: `scale(${scale})`,
        }}
      />
    </span>
  );
}
