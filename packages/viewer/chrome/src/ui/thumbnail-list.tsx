/**
 * The thumbnails panel: the same document through the thumbnail Stage lens (a fixed-zoom grid
 * that wraps into as many columns as the panel's width fits; see the viewer's `thumbnails`
 * plugin). A click goes to the page, and the panel follows the main view.
 *
 * A session that may change the pages (`page:insert-blank` shows and is enabled, the outline
 * panel's rule) organizes them here too:
 * - a click selects the page, Ctrl/Cmd+click adds or removes one, Shift+click selects a range;
 * - each page has a menu: its button, a right-click, or a long press;
 * - dragging moves the selection if the page is in it, else that page, with a line where they
 *   land; a pen or a finger holds the page first, so a swipe still scrolls;
 * - PDFs dropped between pages are inserted there, not opened as a tab;
 * - the header has insert, rotate, delete, the selection's menu, and undo and redo;
 * - the list is one tab stop: arrows go through the pages, Shift extends, Space adds or removes,
 *   Alt+arrows move the selection one place, Delete deletes and Ctrl/Cmd+A selects every page.
 */
import { useCommand, useCommands } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { usePageEdit, usePageEditState } from '@embedpdf/react/page-edit';
import { RenderLayer } from '@embedpdf/react/render';
import { toPageRef, usePageList, type PageRef } from '@embedpdf/react/runtime';
import {
  Scrollbar,
  Stage,
  useStage,
  useStageState,
  type StageCapability,
} from '@embedpdf/react/stage';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { useCloseOnPick } from './panel-frame';
import { slotMove, thumbDropAt, columnsOf, type ThumbBox, type ThumbDrop } from './thumbnail-drop';
import { CommandButton } from './toolbar';
import { isPdfFile, mayCarryPdf } from '../config/open-files';
import type { PageInsertArgs } from '../config/page-commands';
import { ThumbsStageToken } from '../config/stage';

/** How far the pointer moves before a press on a page becomes a drag, in px (the outline's). */
const DRAG_SLOP_PX = 4;
/** How long a pen or a finger holds a page before it drags it, or opens its menu, in ms. */
const HOLD_MS = 450;
/** Within this many px of the list's top or bottom, a drag scrolls the list. */
const EDGE_PX = 28;
/** The lens's spacing when its settings don't say it in px. */
const DEFAULT_GAP_PX = 16;

/** The header's commands: insert and rotate, delete, the menu of the rest, then the history. */
const HEADER_EDITS = [
  'page:insert-blank',
  'page:rotate-counterclockwise',
  'page:rotate-clockwise',
  'page:delete',
  'menu:page',
] as const;
const HEADER_HISTORY = ['history:undo', 'history:redo'] as const;

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** The page the press began on. */
  readonly page: number;
  /** The pages that move, by object number. */
  readonly moving: ReadonlySet<number>;
  /** A pen or a finger held the page: a release now opens its menu, a move drags. */
  readonly held: boolean;
  readonly active: boolean;
  readonly drop: ThumbDrop | null;
}

/** The thumbnails on screen, as boxes in the lens's viewport. */
function boxesOf(thumbs: StageCapability): ThumbBox[] {
  return thumbs.listVisiblePages().map((page) => ({
    page: page.ref.objectNumber,
    x: page.screenX,
    y: page.screenY,
    width: page.transform.viewWidth,
    height: page.transform.viewHeight,
  }));
}

const positionOf = (position: ThumbDrop['position']) =>
  'before' in position
    ? { before: toPageRef(position.before) }
    : { after: toPageRef(position.after) };

export function ThumbnailList() {
  const t = useT();
  const idPrefix = useId();
  const main = useStage(); // the main lens
  const thumbs = useStage(ThumbsStageToken); // the sidebar lens
  const currentPage = useStageState((state) => state.currentPageIndex);
  const pages = usePageList();
  const pageEdit = usePageEdit();
  const selected = usePageEditState((state) => state.selected);
  const commands = useCommands();
  const insertFile = useCommand('page:insert-file');
  const insertBlank = useCommand('page:insert-blank');
  const editable = insertBlank.visible && insertBlank.enabled;
  // A sheet or an overlay closes once a page is picked, so you see where it took you.
  const closeOnPick = useCloseOnPick();

  const host = useRef<HTMLDivElement>(null);
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [anchorPage, setAnchorPage] = useState<number | null>(null);
  const [listFocused, setListFocused] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const [fileDrop, setFileDrop] = useState<ThumbDrop | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const order = pages.map((page) => page.ref.objectNumber);
  const indexOf = (page: number | null) => (page === null ? -1 : order.indexOf(page));
  const selectedPages = new Set(selected.map((ref) => ref.objectNumber));
  const focusedIndex = indexOf(focusedPage) >= 0 ? indexOf(focusedPage) : currentPage;

  // Follow the main view: when its current page changes, make that thumb visible, with the
  // least movement, and none when it's already on screen.
  useEffect(() => thumbs.reveal(currentPage), [currentPage, thumbs]);
  // Pages an edit selects, such as the ones an insert brings, come into view the same way, once
  // the lens has laid them out.
  const laidOut = useStageState((state) => state.pageCount, ThumbsStageToken);
  const lastSelected = selected[selected.length - 1]?.objectNumber ?? null;
  const lastSelectedIndex = lastSelected === null ? -1 : order.indexOf(lastSelected);
  useEffect(() => {
    if (lastSelectedIndex >= 0 && lastSelectedIndex < laidOut) thumbs.reveal(lastSelectedIndex);
  }, [lastSelectedIndex, laidOut, thumbs]);

  const spacing = () => {
    const { gap, pageFrame } = thumbs.getSettings();
    const px = typeof gap === 'object' && gap !== null && 'px' in gap ? gap.px : DEFAULT_GAP_PX;
    return { gap: px, band: pageFrame.bottom };
  };
  /** A pointer's place in the lens's viewport. */
  const pointOf = (clientX: number, clientY: number) => {
    const box = host.current?.getBoundingClientRect();
    return box ? { x: clientX - box.left, y: clientY - box.top } : null;
  };
  const dropAt = (clientX: number, clientY: number, moving: ReadonlySet<number>) => {
    const point = pointOf(clientX, clientY);
    return point ? thumbDropAt(boxesOf(thumbs), point, spacing(), order, moving) : null;
  };

  const go = (index: number) => {
    main.goToPage(index);
    closeOnPick();
  };
  const select = (refs: readonly PageRef[]) => pageEdit.select(refs);

  // ── clicks ────────────────────────────────────────────────────────────────

  const onPageClick = (ref: PageRef, index: number, event: ReactMouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const page = ref.objectNumber;
    setFocusedPage(page);
    if (editable && (event.metaKey || event.ctrlKey)) {
      // Cmd or Ctrl adds the page to the selection, or takes it out.
      select(
        selectedPages.has(page)
          ? selected.filter((each) => each.objectNumber !== page)
          : [...selected, ref],
      );
      setAnchorPage(page);
      return;
    }
    if (editable && event.shiftKey && indexOf(anchorPage) >= 0) {
      // Shift selects every page from the last one picked to this one.
      const from = indexOf(anchorPage);
      const [low, high] = from < index ? [from, index] : [index, from];
      select(pages.slice(low, high + 1).map((each) => each.ref));
      return;
    }
    setAnchorPage(page);
    if (editable) select([ref]);
    go(index);
  };

  /** A page's menu is about to open: an unselected page becomes the selection. */
  const onMenu = (ref: PageRef) => {
    setFocusedPage(ref.objectNumber);
    if (!selectedPages.has(ref.objectNumber)) select([ref]);
  };
  const openMenuOf = (page: number) =>
    host.current
      ?.querySelector<HTMLButtonElement>(`[data-epdf-page-menu="${page}"] button`)
      ?.click();

  // ── dragging pages ────────────────────────────────────────────────────────

  const stopHold = () => {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const onPagePointerDown = (ref: PageRef, event: ReactPointerEvent) => {
    if (!editable || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-epdf-page-menu]')) return;
    const page = ref.objectNumber;
    // A selected page drags the whole selection with it; any other page drags alone.
    const moving = selectedPages.has(page) ? selectedPages : new Set([page]);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      page,
      moving,
      held: false,
      active: false,
      drop: null,
    });
    if (event.pointerType !== 'mouse') {
      holdTimer.current = setTimeout(() => {
        const current = dragRef.current;
        if (current && !current.active) setDrag({ ...current, held: true });
      }, HOLD_MS);
    }
  };

  const dragging = drag?.active === true;
  const pressed = drag !== null;
  useEffect(() => {
    if (!pressed) return undefined;
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!current.active) {
        const moved = Math.hypot(event.clientX - current.startX, event.clientY - current.startY);
        if (moved <= DRAG_SLOP_PX) return;
        if (event.pointerType !== 'mouse' && !current.held) {
          // A finger that moves before the hold is up scrolls the list.
          stopHold();
          setDrag(null);
          return;
        }
      }
      const box = host.current?.getBoundingClientRect();
      if (box && event.clientY < box.top + EDGE_PX) thumbs.scrollBy({ top: -8 });
      else if (box && event.clientY > box.bottom - EDGE_PX) thumbs.scrollBy({ top: 8 });
      setDrag({
        ...current,
        active: true,
        drop: dropAt(event.clientX, event.clientY, current.moving),
      });
    };
    const end = (event: PointerEvent, commit: boolean) => {
      stopHold();
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      setDrag(null);
      if (!current.active) {
        // A long press that didn't move opens the page's menu.
        if (current.held && commit) {
          suppressClick.current = true;
          onMenu(toPageRef(current.page));
          openMenuOf(current.page);
        }
        return;
      }
      // The click a drag ends with is not a click on a page.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!commit || !current.drop) return;
      const moving = pages.filter((page) => current.moving.has(page.ref.objectNumber));
      void pageEdit
        .reorder(
          moving.map((page) => page.ref),
          positionOf(current.drop.position),
        )
        .catch(() => {});
    };
    const up = (event: PointerEvent) => end(event, true);
    const cancel = (event: PointerEvent) => end(event, false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  });

  // While a finger drags, the list must not scroll under it.
  useEffect(() => {
    if (!dragging) return undefined;
    const prevent = (event: TouchEvent) => event.preventDefault();
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => document.removeEventListener('touchmove', prevent);
  }, [dragging]);

  useEffect(() => stopHold, []);

  // ── PDFs dropped from outside ─────────────────────────────────────────────

  const takesFiles = (event: ReactDragEvent) =>
    editable && insertFile.visible && insertFile.enabled && mayCarryPdf(event.dataTransfer);

  const onDragOver = (event: ReactDragEvent) => {
    if (!takesFiles(event)) return;
    // The drop is the panel's, not the viewer's Drop to open.
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setFileDrop(dropAt(event.clientX, event.clientY, new Set()));
  };
  const onDragLeave = (event: ReactDragEvent) => {
    if (!takesFiles(event)) return;
    event.stopPropagation();
    const next = event.relatedTarget as Node | null;
    if (!next || !host.current?.contains(next)) setFileDrop(null);
  };
  const onDrop = (event: ReactDragEvent) => {
    if (!takesFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    const drop = dropAt(event.clientX, event.clientY, new Set());
    setFileDrop(null);
    const files = Array.from(event.dataTransfer.files).filter(isPdfFile);
    if (files.length === 0) return;
    const args: PageInsertArgs = {
      files,
      ...(drop ? { position: positionOf(drop.position) } : {}),
    };
    // A failing command reports itself through the commands' onExecutionFailed.
    void commands.execute('page:insert-file', { args }).catch(() => {});
  };

  // ── the keyboard ──────────────────────────────────────────────────────────

  const focusIndex = (index: number, extend: boolean) => {
    const page = pages[index];
    if (!page) return;
    setFocusedPage(page.ref.objectNumber);
    thumbs.reveal(index);
    if (!editable) {
      main.goToPage(index);
      return;
    }
    if (extend && indexOf(anchorPage) >= 0) {
      const from = indexOf(anchorPage);
      const [low, high] = from < index ? [from, index] : [index, from];
      select(pages.slice(low, high + 1).map((each) => each.ref));
      return;
    }
    setAnchorPage(page.ref.objectNumber);
    select([page.ref]);
    main.goToPage(index);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || pages.length === 0) return;
    setListFocused(true);
    const columns = columnsOf(boxesOf(thumbs));
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
    };
    const step = steps[event.key];
    const mod = event.metaKey || event.ctrlKey;
    if (step !== undefined && event.altKey && editable) {
      // Alt+arrows move the selection one place, past the nearest page that isn't selected.
      event.preventDefault();
      const position = slotMove(order, selectedPages, step < 0 ? -1 : 1);
      const moving = pages.filter((page) => selectedPages.has(page.ref.objectNumber));
      if (position && moving.length > 0) {
        void pageEdit
          .reorder(
            moving.map((page) => page.ref),
            positionOf(position),
          )
          .catch(() => {});
      }
      return;
    }
    if (step !== undefined) {
      event.preventDefault();
      focusIndex(Math.max(0, Math.min(pages.length - 1, focusedIndex + step)), event.shiftKey);
      return;
    }
    switch (event.key) {
      case 'Home':
      case 'End':
        event.preventDefault();
        focusIndex(event.key === 'Home' ? 0 : pages.length - 1, event.shiftKey);
        return;
      case 'Enter':
        event.preventDefault();
        go(focusedIndex);
        return;
      case ' ': {
        if (!editable) return;
        event.preventDefault();
        const page = pages[focusedIndex];
        if (!page) return;
        const number = page.ref.objectNumber;
        setAnchorPage(number);
        select(
          selectedPages.has(number)
            ? selected.filter((each) => each.objectNumber !== number)
            : [...selected, page.ref],
        );
        return;
      }
      case 'Delete':
      case 'Backspace':
        // Backspace is the Delete key of a Mac keyboard.
        if (!editable) return;
        event.preventDefault();
        void commands.execute('page:delete').catch(() => {});
        return;
      case 'a':
      case 'A':
        if (!mod || !editable) return;
        event.preventDefault();
        void commands.execute('page:select-all').catch(() => {});
        return;
    }
  };

  const focusedRef = pages[focusedIndex]?.ref ?? null;
  const shownDrop = dragging ? drag.drop : fileDrop;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editable && <PageHeader />}
      <div
        ref={host}
        role="listbox"
        aria-label={t('panels.thumbnails')}
        aria-multiselectable={editable || undefined}
        tabIndex={0}
        aria-activedescendant={
          listFocused && focusedRef ? `${idPrefix}-${focusedRef.objectNumber}` : undefined
        }
        onKeyDown={onKeyDown}
        onFocus={(event) =>
          event.target === event.currentTarget &&
          setListFocused(event.currentTarget.matches(':focus-visible'))
        }
        onBlur={(event) => event.target === event.currentTarget && setListFocused(false)}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className="focus-visible:ring-accent relative flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <Stage
          token={ThumbsStageToken}
          className="flex-1"
          style={{ position: 'relative' }}
          overlay={
            <>
              {shownDrop && (
                <div
                  aria-hidden
                  className="bg-accent pointer-events-none absolute rounded-full"
                  style={{
                    left: shownDrop.line.x,
                    top: shownDrop.line.y,
                    width: shownDrop.line.width,
                    height: shownDrop.line.height,
                  }}
                />
              )}
              {/* the main view's scrollbar, over this lens: the nearest Stage */}
              <Scrollbar axis="y" />
            </>
          }
          pageChrome={(page) => {
            const number = page.ref.objectNumber;
            const isSelected = editable && selectedPages.has(number);
            const isCurrent = page.pageIndex === currentPage;
            const isFocused = listFocused && focusedRef?.objectNumber === number;
            const isMoving = dragging && drag.moving.has(number);
            const label = t('thumbnails.page', { params: { page: page.pageIndex + 1 } });
            return (
              <div className="group" style={{ position: 'absolute', inset: 0 }}>
                {/* BOX-SPACE chrome: the click target and its border hug the page box; the
                    number sits in the reserved bottom band. Neither rotates. */}
                <button
                  type="button"
                  id={`${idPrefix}-${number}`}
                  role="option"
                  aria-selected={editable ? isSelected : isCurrent}
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={label}
                  tabIndex={-1}
                  title={label}
                  onClick={(event) => onPageClick(page.ref, page.pageIndex, event)}
                  onPointerDown={(event) => onPagePointerDown(page.ref, event)}
                  onContextMenu={(event) => {
                    if (!editable) return;
                    event.preventDefault();
                    onMenu(page.ref);
                    openMenuOf(number);
                  }}
                  // Selected pages in the accent with a tint; the current page with a ring
                  // around it; the others in a light line.
                  className={`box-border cursor-pointer touch-manipulation rounded ${
                    isSelected || isCurrent
                      ? 'border-accent border-2'
                      : 'border-border-subtle border'
                  } ${isCurrent ? 'ring-accent-light ring-2' : ''} ${
                    isSelected ? 'bg-accent/10' : ''
                  } ${isFocused ? 'outline-accent outline outline-2 outline-offset-2' : ''} ${
                    isMoving ? 'bg-surface/60' : ''
                  }`}
                  style={{
                    position: 'absolute',
                    top: page.frame.top,
                    left: page.frame.left,
                    right: page.frame.right,
                    bottom: page.frame.bottom,
                  }}
                />
                {editable && (
                  <span
                    data-epdf-page-menu={number}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDownCapture={() => onMenu(page.ref)}
                    className={`bg-elevated absolute rounded shadow-sm ${
                      isSelected || isFocused
                        ? ''
                        : 'opacity-0 focus-within:opacity-100 group-hover:opacity-100'
                    }`}
                    style={{ top: page.frame.top + 4, right: page.frame.right + 4 }}
                  >
                    <PageMenuButton />
                  </span>
                )}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: page.frame.bottom,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    color: 'var(--epdf-text-muted)',
                    pointerEvents: 'none',
                  }}
                >
                  {page.pageIndex + 1}
                </div>
              </div>
            );
          }}
        >
          {/* page-space content: the bitmap, which rotates with the page */}
          {() => <RenderLayer />}
        </Stage>
      </div>
    </div>
  );
}

/** A page's menu button: the page commands for the selected pages. */
function PageMenuButton() {
  const more = useCommand('menu:page');
  if (!more.visible) return null;
  return <CommandButton cmd={more} variant="icon" run={() => void more.run()} />;
}

/** The header over the thumbnails while the pages can be changed: the edits, then the history. */
function PageHeader() {
  return (
    <div className="border-border-subtle flex items-center gap-1 border-b p-2">
      {HEADER_EDITS.map((id) => (
        <HeaderButton key={id} id={id} />
      ))}
      <span className="flex-1" />
      {HEADER_HISTORY.map((id) => (
        <HeaderButton key={id} id={id} />
      ))}
    </div>
  );
}

function HeaderButton({ id }: { id: string }) {
  const command = useCommand(id);
  if (!command.visible) return null;
  return <CommandButton cmd={command} variant="icon" run={() => void command.run()} />;
}
