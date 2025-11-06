import { Rect } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { MenuWrapperProps } from '@embedpdf/utils/react';
import { useState, useRef } from 'react';
import { TrashIcon } from './icons';

interface AnnotationSelectionMenuProps {
  menuWrapperProps: MenuWrapperProps;
  selected: TrackedAnnotation;
  rect: Rect;
  documentId: string;
}

export function AnnotationSelectionMenu({
  selected,
  documentId,
  menuWrapperProps,
  rect,
}: AnnotationSelectionMenuProps) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);
  const popperRef = useRef<HTMLDivElement>(null);

  // Get document-scoped annotation API
  const annotation = annotationCapability?.forDocument(documentId);

  const handleDelete = () => {
    if (!annotation) return;
    const { pageIndex, id } = selected.object;
    annotation.deleteAnnotation(pageIndex, id);
  };

  return (
    <>
      <span {...menuWrapperProps} ref={setAnchorEl} />
      {anchorEl && (
        <div
          ref={popperRef}
          style={{
            position: 'fixed',
            left: rect.origin.x,
            top: rect.origin.y + rect.size.height + 8,
            zIndex: 1000,
          }}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 shadow-lg"
        >
          <button
            onClick={handleDelete}
            className="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600"
            aria-label="Delete annotation"
            title="Delete annotation"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
