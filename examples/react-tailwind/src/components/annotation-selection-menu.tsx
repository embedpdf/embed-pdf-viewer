import {
  useAnnotationCapability,
  type AnnotationSelectionMenuProps,
} from '@embedpdf/plugin-annotation/react';
import { TrashIcon } from './icons';

interface Props extends AnnotationSelectionMenuProps {
  documentId: string;
}

export function AnnotationSelectionMenu({
  selected,
  context,
  documentId,
  menuWrapperProps,
  rect,
}: Props) {
  const { provides: annotationCapability } = useAnnotationCapability();

  // Get document-scoped annotation API
  const annotationScope = annotationCapability?.forDocument(documentId);

  const handleDelete = () => {
    if (!annotationScope) return;
    const { pageIndex, id } = context.annotation.object;
    annotationScope.deleteAnnotation(pageIndex, id);
  };

  if (!selected) return null;

  // Calculate position - position below the annotation by default
  const menuStyle: React.CSSProperties = {
    position: 'absolute',
    pointerEvents: 'auto',
    cursor: 'default',
    top: rect.size.height + 8,
  };

  return (
    <div {...menuWrapperProps}>
      <div style={menuStyle} className="rounded-lg border border-gray-200 bg-white shadow-lg">
        <div className="flex items-center gap-1 px-2 py-1">
          <button
            onClick={handleDelete}
            className="flex items-center justify-center rounded p-1.5 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600"
            aria-label="Delete annotation"
            title="Delete annotation"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
