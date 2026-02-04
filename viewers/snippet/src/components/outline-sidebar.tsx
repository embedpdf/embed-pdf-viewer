import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/preact';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { useTranslations } from '@embedpdf/plugin-i18n/preact';
import {
  PdfBookmarkObject,
  PdfZoomMode,
  PdfErrorCode,
  ignore,
  PdfActionType,
  PdfDestinationObject,
} from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/preact';
import { Icon } from './ui/icon';
import { ChevronDownIcon } from './icons/chevron-down';
import { ChevronRightIcon } from './icons/chevron-right';

type OutlineSidebarProps = {
  documentId: string;
};

export function OutlineSidebar({ documentId }: OutlineSidebarProps) {
  const { provides: bookmark } = useBookmarkCapability();
  const { provides: scroll } = useScrollCapability();
  const { translate } = useTranslations(documentId);
  const documentState = useDocumentState(documentId);
  const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!bookmark || !documentState?.document) return;

    setIsLoading(true);
    const task = bookmark.getBookmarks();
    task.wait(
      ({ bookmarks }) => {
        setBookmarks(bookmarks);
        // Auto-expand first level items
        const firstLevelIds = bookmarks.map((_, index) => `bookmark-${index}`);
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

  const handleBookmarkClick = (bookmark: PdfBookmarkObject) => {
    if (!scroll || !bookmark.target) return;

    // Extract destination from either action or direct destination target
    let destination: PdfDestinationObject | undefined;

    if (bookmark.target.type === 'action') {
      const action = bookmark.target.action;
      if (action.type === PdfActionType.Goto || action.type === PdfActionType.RemoteGoto) {
        destination = action.destination;
      } else if (action.type === PdfActionType.URI) {
        // Open URI in new tab
        window.open(action.uri, '_blank');
        return;
      }
      // Other action types (Unsupported, LaunchAppOrOpenFile) are not handled
    } else if (bookmark.target.type === 'destination') {
      destination = bookmark.target.destination;
    }

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
      // Handle FitPage, FitH, FitV, FitR, FitB, FitBH, FitBV, etc.
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
    index: number,
    level: number = 0,
  ): h.JSX.Element => {
    const id = `bookmark-${index}`;
    const hasChildren = bookmark.children && bookmark.children.length > 0;
    const isExpanded = expandedItems.has(id);

    return (
      <div key={id} className="select-none">
        <div
          className="hover:bg-interactive-hover flex cursor-pointer items-center gap-1 px-2 py-1"
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
          <span className="text-fg-secondary text-sm">{bookmark.title}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {bookmark.children?.map((child, childIndex) =>
              renderBookmark(child, childIndex, level + 1),
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
          {bookmarks.map((bookmark, index) => renderBookmark(bookmark, index))}
        </div>
      </div>
    </div>
  );
}
