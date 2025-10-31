import { AnnotationTool, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useEffect, useState, useMemo } from 'react';
import { ToolbarButton } from './ui';
import { ArrowIcon, CircleIcon, HighlightIcon, PenIcon, SquareIcon, TextIcon } from './icons';

type AnnotationToolbarProps = {
  documentId: string;
};

export function AnnotationToolbar({ documentId }: AnnotationToolbarProps) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);

  // Get scoped API for this document
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  useEffect(() => {
    if (!annotationProvides) return;

    // Initialize with current tool
    setActiveTool(annotationProvides.getActiveTool());

    // Subscribe to changes
    return annotationProvides.onActiveToolChange((tool) => {
      setActiveTool(tool);
    });
  }, [annotationProvides]);

  if (!annotationProvides) return null;

  const toggleTool = (toolId: string) => {
    const currentId = activeTool?.id ?? null;
    annotationProvides.setActiveTool(currentId === toolId ? null : toolId);
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
      <ToolbarButton
        onClick={() => toggleTool('freeText')}
        isActive={activeTool?.id === 'freeText'}
        aria-label="Text annotation"
        title="Add Text Annotation"
      >
        <TextIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('ink')}
        isActive={activeTool?.id === 'ink'}
        aria-label="Freehand annotation"
        title="Draw Freehand"
      >
        <PenIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('circle')}
        isActive={activeTool?.id === 'circle'}
        aria-label="Circle annotation"
        title="Draw Circle"
      >
        <CircleIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('square')}
        isActive={activeTool?.id === 'square'}
        aria-label="Square annotation"
        title="Draw Rectangle"
      >
        <SquareIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('lineArrow')}
        isActive={activeTool?.id === 'lineArrow'}
        aria-label="Arrow annotation"
        title="Draw Arrow"
      >
        <ArrowIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('highlight')}
        isActive={activeTool?.id === 'highlight'}
        aria-label="Highlight text"
        title="Highlight Text"
      >
        <HighlightIcon className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
