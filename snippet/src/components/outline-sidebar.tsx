import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useBookmarkCapability } from '@embedpdf/plugin-bookmark/preact';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { PdfBookmarkObject, PdfZoomMode, PdfErrorCode, ignore } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/preact';

type OutlineSidebarProps = {
  documentId: string;
};

export function OutlineSidebar({ documentId }: OutlineSidebarProps) {
  const { provides: bookmark } = useBookmarkCapability();
  const { provides: scroll } = useScrollCapability();
  const documentState = useDocumentState(documentId);
  const [bookmarks, setBookmarks] = useState<PdfBookmarkObject[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!bookmark || !documentState?.document) return;
    const task = bookmark.getBookmarks();
    task.wait(({ bookmarks }) => {
      setBookmarks(bookmarks);
      // Auto-expand first level items
      const firstLevelIds = bookmarks.map((_, index) => `bookmark-${index}`);
      setExpandedItems(new Set(firstLevelIds));
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'Bookmark task cancelled',
      });
    };
  }, [bookmark, documentState?.document]);

  const handleBookmarkClick = (bookmark: PdfBookmarkObject) => {
    if (!scroll || !bookmark.target || bookmark.target.type !== 'action') return;

    const action = bookmark.target.action;
    if (action.type === 1 && action.destination) {
      // Type 1 is "Go to destination"
      const destination = action.destination;

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
      } else if (destination.zoom.mode === PdfZoomMode.FitPage) {
        scroll.scrollToPage({
          pageNumber: destination.pageIndex + 1,
          behavior: 'smooth',
        });
      }
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
          className="flex cursor-pointer items-center gap-1 px-2 py-1 hover:bg-gray-100"
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
                <Icon.chevronDownIcon className="h-3 w-3" />
              ) : (
                <Icon.chevronRightIcon className="h-3 w-3" />
              )}
            </button>
          )}
          {!hasChildren && <div className="w-4" />}
          <span className="text-sm text-gray-700">{bookmark.title}</span>
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

  if (!documentState?.document) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 text-sm text-gray-600">
        <div className="font-medium text-gray-900">Outline</div>
        <p>Loading outline...</p>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex h-full flex-col gap-3 p-4 text-sm text-gray-600">
        <div className="font-medium text-gray-900">Outline</div>
        <p>No outline available for this document.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="p-2">
        {bookmarks.map((bookmark, index) => renderBookmark(bookmark, index))}
      </div>
    </div>
  );
}
