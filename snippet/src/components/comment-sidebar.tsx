import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';
import {
  getAnnotationByUid,
  getSidebarAnnotationsWithRepliesGroupedByPage,
  useAnnotation,
  useAnnotationCapability,
} from '@embedpdf/plugin-annotation/preact';
import { useScrollCapability } from '@embedpdf/plugin-scroll/preact';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { uuidV4, PdfAnnotationSubtype, PdfAnnotationIcon } from '@embedpdf/models';
import { AnnotationCard } from './comment-sidebar/annotation-card';
import { EmptyState } from './comment-sidebar/empty-state';

export interface CommentSidebarProps {
  documentId: string;
}

export const CommentSidebar = ({ documentId }: CommentSidebarProps) => {
  const { provides: annotationApi } = useAnnotationCapability();
  const { provides: annotation, state } = useAnnotation(documentId);
  const { provides: scrollApi } = useScrollCapability();
  const annotationRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const selectedAnnotation = state.selectedUid
    ? getAnnotationByUid(state, state.selectedUid)
    : null;
  const sidebarAnnotations = getSidebarAnnotationsWithRepliesGroupedByPage(state);

  // Effect to scroll to the selected annotation
  useEffect(() => {
    if (selectedAnnotation && scrollContainerRef.current) {
      const element = annotationRefs.current[selectedAnnotation.object.id];

      if (element && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();

        // Calculate element's position relative to container's scrollable content
        const elementTopInScrollContent = elementRect.top - containerRect.top + container.scrollTop;

        // Calculate centered scroll position
        const targetScroll =
          elementTopInScrollContent - container.clientHeight / 2 + elementRect.height / 2;

        container.scrollTo({
          top: targetScroll,
          behavior: 'smooth',
        });
      }
    }
  }, [selectedAnnotation]);

  const handleSelect = (ann: TrackedAnnotation) => {
    annotationApi?.selectAnnotation(ann.object.pageIndex, ann.object.id);
    scrollApi?.scrollToPage({
      pageNumber: ann.object.pageIndex + 1,
      pageCoordinates: {
        x: ann.object.rect.origin.x,
        y: ann.object.rect.origin.y,
      },
      alignX: 50,
      alignY: 25,
      behavior: 'smooth',
    });
  };

  const handleUpdate = (id: string, contents: string) => {
    const ann = findAnnotationById(id); // Helper function to find the annotation
    if (ann) {
      annotationApi?.updateAnnotation(ann.object.pageIndex, id, { contents, modified: new Date() });
    }
  };

  const handleDelete = (ann: TrackedAnnotation) => {
    annotationApi?.deleteAnnotation(ann.object.pageIndex, ann.object.id);
  };

  const handleReply = (inReplyToId: string, contents: string) => {
    const parentAnn = findAnnotationById(inReplyToId);
    if (parentAnn) {
      annotationApi?.createAnnotation(parentAnn.object.pageIndex, {
        id: uuidV4(),
        rect: {
          origin: {
            x: parentAnn.object.rect.origin.x,
            y: parentAnn.object.rect.origin.y,
          },
          size: {
            width: 24,
            height: 24,
          },
        },
        pageIndex: parentAnn.object.pageIndex,
        created: new Date(),
        modified: new Date(),
        type: PdfAnnotationSubtype.TEXT,
        contents,
        inReplyToId: parentAnn.object.id,
        flags: ['noRotate', 'noZoom', 'print'],
        icon: PdfAnnotationIcon.Comment,
      });
    }
  };

  const sortedPages = Object.keys(sidebarAnnotations)
    .map(Number)
    .sort((a, b) => a - b);

  // Helper function needed to find annotation across all pages
  const findAnnotationById = (id: string): TrackedAnnotation | undefined => {
    for (const pageNum of sortedPages) {
      for (const entry of sidebarAnnotations[pageNum]) {
        if (entry.annotation.object.id === id) return entry.annotation;
        const reply = entry.replies.find((r) => r.object.id === id);
        if (reply) return reply;
      }
    }
    return undefined;
  };

  if (sortedPages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto">
      <div className="space-y-6 p-3">
        {sortedPages.map((pageNumber) => (
          <div key={pageNumber} className="space-y-3">
            {/* Page Header */}
            <div className="sticky top-0 z-10 bg-white px-1">
              <div className="border-b border-gray-200 py-2">
                <h3 className="text-md font-semibold text-gray-800">Page {pageNumber + 1}</h3>
                <p className="text-sm text-gray-500">
                  {sidebarAnnotations[pageNumber].length} comment
                  {sidebarAnnotations[pageNumber].length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Annotation Cards */}
            <div className="space-y-3 px-1">
              {sidebarAnnotations[pageNumber].map((entry) => (
                <div
                  key={entry.annotation.object.id}
                  ref={(el) => {
                    if (el) {
                      annotationRefs.current[entry.annotation.object.id] = el;
                    }
                  }}
                >
                  <AnnotationCard
                    entry={entry}
                    isSelected={selectedAnnotation?.object.id === entry.annotation.object.id}
                    onSelect={() => handleSelect(entry.annotation)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                    onReply={handleReply}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
