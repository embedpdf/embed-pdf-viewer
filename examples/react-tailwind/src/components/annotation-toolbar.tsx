import { AnnotationTool, useAnnotationCapability } from '@embedpdf/plugin-annotation/react';
import { useHistoryCapability } from '@embedpdf/plugin-history/react';
import { useEffect, useState, useMemo } from 'react';
import { ToolbarButton } from './ui';
import {
  HighlightIcon,
  UnderlineIcon,
  StrikethroughIcon,
  SquigglyIcon,
  PenIcon,
  TextIcon,
  CircleIcon,
  SquareIcon,
  PolygonIcon,
  PolylineIcon,
  LineIcon,
  ArrowIcon,
  UndoIcon,
  RedoIcon,
} from './icons';

type AnnotationToolbarProps = {
  documentId: string;
};

// Helper type for tool colors
type ToolColors = Record<string, { primaryColor?: string; secondaryColor?: string }>;

// Helper function to extract tool colors
function extractToolColors(tools: AnnotationTool[]): ToolColors {
  const colors: ToolColors = {};
  tools.forEach((tool) => {
    const defaults = tool.defaults as any;
    colors[tool.id] = {
      primaryColor: defaults.strokeColor || defaults.color || defaults.fontColor,
      secondaryColor: defaults.color,
    };
  });
  return colors;
}

export function AnnotationToolbar({ documentId }: AnnotationToolbarProps) {
  const { provides: annotationCapability } = useAnnotationCapability();
  const { provides: historyCapability } = useHistoryCapability();
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Initialize tool colors synchronously to avoid flash
  const [toolColors, setToolColors] = useState<ToolColors>(() =>
    annotationCapability ? extractToolColors(annotationCapability.getTools()) : {},
  );

  // Get scoped API for this document
  const annotationProvides = useMemo(
    () => (annotationCapability ? annotationCapability.forDocument(documentId) : null),
    [annotationCapability, documentId],
  );

  // Get scoped history for this document
  const historyProvides = useMemo(
    () => (historyCapability ? historyCapability.forDocument(documentId) : null),
    [historyCapability, documentId],
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

  // Subscribe to tool changes to get tool defaults (only fires when tools are updated)
  useEffect(() => {
    if (!annotationCapability) return;

    // Subscribe to tool changes (only when tool defaults are updated)
    return annotationCapability.onToolsChange((event) => {
      setToolColors(extractToolColors(event.tools));
    });
  }, [annotationCapability]);

  // Subscribe to history state changes for this document
  useEffect(() => {
    if (!historyProvides) return;

    // Initialize with current state
    const state = historyProvides.getHistoryState();
    setCanUndo(state.global.canUndo);
    setCanRedo(state.global.canRedo);

    // Subscribe to history changes
    return historyProvides.onHistoryChange(() => {
      const newState = historyProvides.getHistoryState();
      setCanUndo(newState.global.canUndo);
      setCanRedo(newState.global.canRedo);
    });
  }, [historyProvides]);

  if (!annotationProvides) return null;

  const toggleTool = (toolId: string) => {
    const currentId = activeTool?.id ?? null;
    annotationProvides.setActiveTool(currentId === toolId ? null : toolId);
  };

  const handleUndo = () => {
    if (historyProvides) {
      historyProvides.undo();
    }
  };

  const handleRedo = () => {
    if (historyProvides) {
      historyProvides.redo();
    }
  };

  return (
    <div className="flex items-center gap-2 border-b border-gray-300 bg-white px-3 py-2">
      <ToolbarButton
        onClick={() => toggleTool('highlight')}
        isActive={activeTool?.id === 'highlight'}
        aria-label="Highlight text"
        title="Highlight Text"
      >
        <HighlightIcon className="h-4 w-4" style={{ color: toolColors.highlight?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('underline')}
        isActive={activeTool?.id === 'underline'}
        aria-label="Underline text"
        title="Underline"
      >
        <UnderlineIcon className="h-4 w-4" style={{ color: toolColors.underline?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('strikeout')}
        isActive={activeTool?.id === 'strikeout'}
        aria-label="Strikethrough text"
        title="Strikethrough"
      >
        <StrikethroughIcon
          className="h-4 w-4"
          style={{ color: toolColors.strikeout?.primaryColor }}
        />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('squiggly')}
        isActive={activeTool?.id === 'squiggly'}
        aria-label="Squiggly underline"
        title="Squiggly Underline"
      >
        <SquigglyIcon className="h-4 w-4" style={{ color: toolColors.squiggly?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('ink')}
        isActive={activeTool?.id === 'ink'}
        aria-label="Freehand annotation"
        title="Draw Freehand"
      >
        <PenIcon className="h-4 w-4" style={{ color: toolColors.ink?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('freeText')}
        isActive={activeTool?.id === 'freeText'}
        aria-label="Text annotation"
        title="Add Text Annotation"
      >
        <TextIcon className="h-4 w-4" style={{ color: toolColors.freeText?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('circle')}
        isActive={activeTool?.id === 'circle'}
        aria-label="Circle annotation"
        title="Draw Circle"
      >
        <CircleIcon className="h-4 w-4" style={{ color: toolColors.circle?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('square')}
        isActive={activeTool?.id === 'square'}
        aria-label="Square annotation"
        title="Draw Rectangle"
      >
        <SquareIcon className="h-4 w-4" style={{ color: toolColors.square?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('polygon')}
        isActive={activeTool?.id === 'polygon'}
        aria-label="Polygon annotation"
        title="Draw Polygon"
      >
        <PolygonIcon className="h-4 w-4" style={{ color: toolColors.polygon?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('polyline')}
        isActive={activeTool?.id === 'polyline'}
        aria-label="Polyline annotation"
        title="Draw Polyline"
      >
        <PolylineIcon className="h-4 w-4" style={{ color: toolColors.polyline?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('line')}
        isActive={activeTool?.id === 'line'}
        aria-label="Line annotation"
        title="Draw Line"
      >
        <LineIcon className="h-4 w-4" style={{ color: toolColors.line?.primaryColor }} />
      </ToolbarButton>

      <ToolbarButton
        onClick={() => toggleTool('lineArrow')}
        isActive={activeTool?.id === 'lineArrow'}
        aria-label="Arrow annotation"
        title="Draw Arrow"
      >
        <ArrowIcon className="h-4 w-4" style={{ color: toolColors.lineArrow?.primaryColor }} />
      </ToolbarButton>

      {/* Divider */}
      <div className="mx-1 h-6 w-px bg-gray-300" />

      {/* Undo/Redo buttons */}
      <ToolbarButton onClick={handleUndo} disabled={!canUndo} aria-label="Undo" title="Undo">
        <UndoIcon className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton onClick={handleRedo} disabled={!canRedo} aria-label="Redo" title="Redo">
        <RedoIcon className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}
