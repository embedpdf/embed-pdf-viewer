import { getDocumentPageOrder, setPageOrder } from '@embedpdf/core';
import { useDocumentState, useRegistry } from '@embedpdf/core/react';
import { useScroll } from '@embedpdf/plugin-scroll/react';
import { ThumbnailsPane, ThumbImg } from '@embedpdf/plugin-thumbnail/react';
import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { moveSourcePageInOrder, moveSourcePagesInOrder } from '../utils/page-order';

type ThumbnailsSidebarProps = {
  documentId: string;
  onClose?: () => void;
};

const dragPageIndexesMimeType = 'application/x-embedpdf-page-indexes';

const parseDraggedPageIndexes = (event: DragEvent<HTMLDivElement>): number[] => {
  const raw =
    event.dataTransfer.getData(dragPageIndexesMimeType) || event.dataTransfer.getData('text/plain');

  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((pageIndex): pageIndex is number => Number.isInteger(pageIndex));
    }
  } catch {
    // Fall back to comma-separated text/plain data for browsers that ignore custom drag types.
  }

  return raw
    .split(',')
    .map(Number)
    .filter((pageIndex) => Number.isInteger(pageIndex));
};

export function ThumbnailsSidebar({ documentId }: ThumbnailsSidebarProps) {
  const { registry } = useRegistry();
  const documentState = useDocumentState(documentId);
  const { state, provides } = useScroll(documentId);
  const [selectedPageIndexes, setSelectedPageIndexes] = useState<number[]>([]);
  const [selectionAnchorPageNumber, setSelectionAnchorPageNumber] = useState<number | null>(null);
  const [selectionFocusPageNumber, setSelectionFocusPageNumber] = useState<number | null>(null);
  const [draggedPageIndexes, setDraggedPageIndexes] = useState<number[]>([]);
  const [dragOverPageNumber, setDragOverPageNumber] = useState<number | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const suppressClickRef = useRef(false);

  const pageOrder = getDocumentPageOrder(documentState);
  const selectedPageIndexSet = new Set(selectedPageIndexes);
  const draggedPageIndexSet = new Set(draggedPageIndexes);

  useEffect(() => {
    setSelectedPageIndexes([]);
    setSelectionAnchorPageNumber(null);
    setSelectionFocusPageNumber(null);
    setDraggedPageIndexes([]);
    setDragOverPageNumber(null);
  }, [documentId]);

  const updatePageOrder = (nextOrder: number[]) => {
    registry?.getStore().dispatchToCore(setPageOrder(documentId, nextOrder));
  };

  const sortPageIndexesByCurrentOrder = (pageIndexes: number[], order = pageOrder) => {
    const pageIndexSet = new Set(pageIndexes);
    return order.filter((pageIndex) => pageIndexSet.has(pageIndex));
  };

  const scrollToPage = (pageNumber: number) => {
    provides?.scrollToPage?.({
      pageNumber,
      behavior: 'instant',
    });
  };

  const clampPageNumber = (pageNumber: number) =>
    Math.max(1, Math.min(pageNumber, pageOrder.length));

  const selectPageRange = (anchorPageNumber: number, focusPageNumber: number) => {
    if (pageOrder.length === 0) return;

    const anchor = clampPageNumber(anchorPageNumber);
    const focus = clampPageNumber(focusPageNumber);
    const startIndex = Math.min(anchor, focus) - 1;
    const endIndex = Math.max(anchor, focus);

    setSelectedPageIndexes(pageOrder.slice(startIndex, endIndex));
    setSelectionAnchorPageNumber(anchor);
    setSelectionFocusPageNumber(focus);
  };

  const setMovedPageSelection = (nextOrder: number[], sourcePageIndexes: number[]) => {
    const movedPageIndexSet = new Set(sourcePageIndexes);
    const nextSelection = nextOrder.filter((pageIndex) => movedPageIndexSet.has(pageIndex));
    const firstMovedPageNumber =
      nextOrder.findIndex((pageIndex) => movedPageIndexSet.has(pageIndex)) + 1;

    setSelectedPageIndexes(nextSelection);

    if (firstMovedPageNumber > 0) {
      setSelectionAnchorPageNumber(firstMovedPageNumber);
      setSelectionFocusPageNumber(firstMovedPageNumber);
      scrollToPage(firstMovedPageNumber);
    }
  };

  const handleThumbnailKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || !event.shiftKey) return;

    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      if (pageOrder.length === 0) return;

      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const focusPageNumber =
        selectionFocusPageNumber ?? selectionAnchorPageNumber ?? state.currentPage;
      const nextFocusPageNumber = clampPageNumber(focusPageNumber + direction);
      const anchorPageNumber = selectionAnchorPageNumber ?? focusPageNumber;

      selectPageRange(anchorPageNumber, nextFocusPageNumber);
      scrollToPage(nextFocusPageNumber);
    }
  };

  const handleThumbnailClick = (
    event: MouseEvent<HTMLDivElement>,
    pageIndex: number,
    pageNumber: number,
  ) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    if (event.shiftKey) {
      const anchorPageNumber =
        selectionAnchorPageNumber ?? selectionFocusPageNumber ?? state.currentPage ?? pageNumber;
      selectPageRange(anchorPageNumber, pageNumber);
    } else if (event.metaKey || event.ctrlKey) {
      const nextSelection = new Set(selectedPageIndexes);
      if (nextSelection.has(pageIndex)) {
        nextSelection.delete(pageIndex);
      } else {
        nextSelection.add(pageIndex);
      }

      setSelectedPageIndexes(sortPageIndexesByCurrentOrder(Array.from(nextSelection)));
      setSelectionAnchorPageNumber(pageNumber);
      setSelectionFocusPageNumber(pageNumber);
    } else {
      setSelectedPageIndexes([pageIndex]);
      setSelectionAnchorPageNumber(pageNumber);
      setSelectionFocusPageNumber(pageNumber);
    }

    sidebarRef.current?.focus();
    scrollToPage(pageNumber);
  };

  const moveSourcePage = (sourcePageIndex: number, toPageNumber: number) => {
    const nextOrder = moveSourcePageInOrder(pageOrder, sourcePageIndex, toPageNumber - 1);
    updatePageOrder(nextOrder);

    if (selectedPageIndexSet.has(sourcePageIndex)) {
      setSelectedPageIndexes(sortPageIndexesByCurrentOrder(selectedPageIndexes, nextOrder));
      setSelectionAnchorPageNumber(toPageNumber);
      setSelectionFocusPageNumber(toPageNumber);
    }

    scrollToPage(toPageNumber);
  };

  const moveSourcePages = (sourcePageIndexes: number[], toPageNumber: number) => {
    const nextOrder = moveSourcePagesInOrder(pageOrder, sourcePageIndexes, toPageNumber - 1);
    if (nextOrder === pageOrder) return;

    updatePageOrder(nextOrder);

    setMovedPageSelection(nextOrder, sourcePageIndexes);
  };

  return (
    <div
      ref={sidebarRef}
      tabIndex={0}
      aria-label="Page thumbnails"
      onKeyDown={handleThumbnailKeyDown}
      className="flex h-full w-44 shrink-0 flex-col border-r border-gray-200 bg-gray-50"
    >
      {/* Thumbnails */}
      <div className="flex-1 overflow-hidden">
        <ThumbnailsPane documentId={documentId} style={{ width: '100%', height: '100%' }}>
          {(m) => {
            const isSelected = selectedPageIndexSet.has(m.pageIndex);
            const isDragging = draggedPageIndexSet.has(m.pageIndex);
            const isDropTarget = dragOverPageNumber === m.pageNumber && !isDragging;

            return (
              <div
                key={m.pageIndex}
                draggable
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: m.wrapperHeight,
                  top: m.top,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  padding: '8px',
                  opacity: isDragging ? 0.45 : 1,
                  backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : undefined,
                }}
                aria-selected={isSelected}
                onClick={(event) => handleThumbnailClick(event, m.pageIndex, m.pageNumber)}
                onDragStart={(event) => {
                  const pageIndexesToDrag = isSelected
                    ? sortPageIndexesByCurrentOrder(selectedPageIndexes)
                    : [m.pageIndex];

                  suppressClickRef.current = true;
                  setDraggedPageIndexes(pageIndexesToDrag);

                  if (!isSelected) {
                    setSelectedPageIndexes([m.pageIndex]);
                    setSelectionAnchorPageNumber(m.pageNumber);
                    setSelectionFocusPageNumber(m.pageNumber);
                  }

                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(
                    dragPageIndexesMimeType,
                    JSON.stringify(pageIndexesToDrag),
                  );
                  event.dataTransfer.setData('text/plain', pageIndexesToDrag.join(','));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverPageNumber(m.pageNumber);
                }}
                onDragLeave={() => {
                  setDragOverPageNumber((pageNumber) =>
                    pageNumber === m.pageNumber ? null : pageNumber,
                  );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourcePageIndexes =
                    draggedPageIndexes.length > 0
                      ? draggedPageIndexes
                      : parseDraggedPageIndexes(event);

                  if (sourcePageIndexes.length > 0) {
                    moveSourcePages(sourcePageIndexes, m.pageNumber);
                  }

                  setDraggedPageIndexes([]);
                  setDragOverPageNumber(null);
                }}
                onDragEnd={() => {
                  setDraggedPageIndexes([]);
                  setDragOverPageNumber(null);
                  globalThis.setTimeout(() => {
                    suppressClickRef.current = false;
                  }, 0);
                }}
              >
                <div
                  style={{
                    width: m.width,
                    height: m.height,
                    border: `2px solid ${
                      isDropTarget
                        ? '#10b981'
                        : isSelected || state.currentPage === m.pageNumber
                          ? '#2563eb'
                          : '#d1d5db'
                    }`,
                    borderRadius: '4px',
                    overflow: 'hidden',
                    boxShadow: isDropTarget
                      ? '0 0 0 2px rgba(16, 185, 129, 0.2)'
                      : isSelected || state.currentPage === m.pageNumber
                        ? '0 0 0 2px rgba(37, 99, 235, 0.22)'
                        : 'none',
                  }}
                >
                  <ThumbImg
                    documentId={documentId}
                    meta={m}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
                <div
                  style={{
                    height: m.labelHeight,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: '4px',
                  }}
                >
                  <input
                    key={`${m.pageIndex}-${m.pageNumber}`}
                    type="text"
                    inputMode="numeric"
                    defaultValue={m.pageNumber}
                    aria-label={`Move page ${m.pageNumber}`}
                    className="h-5 w-10 rounded border border-transparent bg-transparent text-center text-xs text-gray-600 outline-none focus:border-blue-400 focus:bg-white"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onDragStart={(event) => event.preventDefault()}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={(event) => {
                      const nextPageNumber = Number(event.currentTarget.value);
                      if (
                        Number.isInteger(nextPageNumber) &&
                        nextPageNumber >= 1 &&
                        nextPageNumber <= pageOrder.length &&
                        nextPageNumber !== m.pageNumber
                      ) {
                        moveSourcePage(m.pageIndex, nextPageNumber);
                      } else {
                        event.currentTarget.value = String(m.pageNumber);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }

                      if (event.key === 'Escape') {
                        event.currentTarget.value = String(m.pageNumber);
                        event.currentTarget.blur();
                      }
                    }}
                  />
                </div>
              </div>
            );
          }}
        </ThumbnailsPane>
      </div>
    </div>
  );
}
