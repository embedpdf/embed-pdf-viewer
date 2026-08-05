import { h } from 'preact';
import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import {
  useBookmarkCapability,
  getActiveBookmarkPath,
  resolveBookmarkDestination,
} from '@embedpdf/plugin-bookmark/preact';
import { useScroll } from '@embedpdf/plugin-scroll/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import { PdfBookmarkObject, PdfZoomMode, PdfErrorCode, PdfActionType } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/preact';
import { ChevronDownIcon } from './icons/chevron-down';
import { ChevronRightIcon } from './icons/chevron-right';

type OutlineSidebarProps = {
  documentId: string;
};

export function OutlineSidebar({ documentId }: OutlineSidebarProps) {
  const { provides: bookmark } = useBookmarkCapability();
  const { provides: scroll, state: scrollState } = useScroll(documentId);
  const { translate } = useTranslations(documentId);
  const documentState = useDocumentState(documentId);
  const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!bookmark || !documentState?.document) return;

    setIsLoading(true);
    const task = bookmark.getBookmarks();
    task.wait(
      ({ bookmarks }) => {
        setBookmarks(bookmarks);
        // Auto-expand first level items (ids are path-based: "0", "1", ...).
        const firstLevelIds = bookmarks.map((_, index) => `${index}`);
        setExpandedItems(new Set(firstLevelIds));
        setIsLoading(false);
      },
      () => {
        setIsLoading(false);
      },
    );

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'Bookmark task cancelled',
      });
    };
  }, [bookmark, documentState?.document]);

  // Path of the bookmark that corresponds to the current reading page.
  const activePath = useMemo(
    () => getActiveBookmarkPath(bookmarks, scrollState.currentPage - 1),
    [bookmarks, scrollState.currentPage],
  );
  const activeId = activePath ? activePath.join('.') : null;

  // Auto-expand the active entry's ancestors so it is always revealed.
  useEffect(() => {
    if (!activePath || activePath.length <= 1) return;
    setExpandedItems((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (let i = 1; i < activePath.length; i++) {
        const ancestorId = activePath.slice(0, i).join('.');
        if (!next.has(ancestorId)) {
          next.add(ancestorId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Depend on the serialized active id; activePath is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Bring the active entry into view when it changes (or after ancestors expand).
  // `block: 'nearest'` is a no-op when the entry is already visible.
  useEffect(() => {
    if (!activeId) return;
    activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeId, expandedItems]);

  const handleBookmarkClick = (bookmark: PdfBookmarkObject) => {
    if (!scroll || !bookmark.target) return;

    // URI actions open in a new tab.
    if (bookmark.target.type === 'action' && bookmark.target.action.type === PdfActionType.URI) {
      window.open(bookmark.target.action.uri, '_blank');
      return;
    }

    const destination = resolveBookmarkDestination(bookmark);
    if (!destination) return;

    if (destination.zoom.mode === PdfZoomMode.XYZ) {
      const page = documentState?.document?.pages.find((p) => p.index === destination.pageIndex);
      if (!page) return;

      scroll.scrollToPage({
        pageNumber: destination.pageIndex + 1,
        pageCoordinates: destination.zoom.params
          ? {
              x: destination.zoom.params.x,
              y: page.size.height - destination.zoom.params.y,
            }
          : undefined,
        behavior: 'smooth',
      });
    } else {
      scroll.scrollToPage({
        pageNumber: destination.pageIndex + 1,
        behavior: 'smooth',
      });
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderBookmark = (
    bookmark: PdfBookmarkObject,
    path: number[],
    level: number = 0,
  ): h.JSX.Element => {
    const id = path.join('.');
    const hasChildren = bookmark.children && bookmark.children.length > 0;
    const isExpanded = expandedItems.has(id);
    const isActive = id === activeId;

    return (
      <div key={id} className="select-none">
        <div
          ref={isActive ? activeRef : undefined}
          aria-current={isActive ? 'true' : undefined}
          className={`flex cursor-pointer items-center gap-1 px-2 py-1 ${
            isActive ? 'bg-interactive-selected' : 'hover:bg-interactive-hover'
          }`}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleBookmarkClick(bookmark)}
        >
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(id);
              }}
              className="flex h-4 w-4 items-center justify-center"
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-3 w-3" />
              ) : (
                <ChevronRightIcon className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          <span
            className={`text-sm ${
              isActive ? 'text-accent-primary font-medium' : 'text-fg-secondary'
            }`}
          >
            {bookmark.title}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {bookmark.children?.map((child, childIndex) =>
              renderBookmark(child, [...path, childIndex], level + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  if (!documentState?.document || isLoading) {
    return (
      <div className="text-fg-secondary flex h-full flex-col gap-3 p-4 text-sm">
        <div className="text-fg-primary font-medium">{translate('outline.title')}</div>
        <p>{translate('outline.loading')}</p>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-fg-muted text-center">
          <div className="text-sm">{translate('outline.noOutline')}</div>
          <div className="mt-1 text-xs">{translate('outline.noBookmarks')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-bg-surface flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="outline-tree">
          {bookmarks.map((bookmark, index) => renderBookmark(bookmark, [index]))}
        </div>
      </div>
    </div>
  );
}
