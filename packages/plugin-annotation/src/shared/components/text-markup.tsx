import { blendModeToCss, PdfAnnotationSubtype, PdfBlendMode, Rect } from '@embedpdf/models';
import { AnnotationTool } from '@embedpdf/plugin-annotation';
import { useSelectionCapability } from '@embedpdf/plugin-selection/@framework';

import { useEffect, useState } from '@framework';
import { useAnnotationCapability } from '../hooks';
import { Highlight } from './text-markup/highlight';
import { Squiggly } from './text-markup/squiggly';
import { Underline } from './text-markup/underline';
import { Strikeout } from './text-markup/strikeout';

interface TextMarkupProps {
  documentId: string;
  pageIndex: number;
  scale: number;
}

export function TextMarkup({ documentId, pageIndex, scale }: TextMarkupProps) {
  const { provides: selectionProvides } = useSelectionCapability();
  const { provides: annotationProvides } = useAnnotationCapability();
  const [rects, setRects] = useState<Array<Rect>>([]);
  const [boundingRect, setBoundingRect] = useState<Rect | null>(null);
  const [activeTool, setActiveTool] = useState<AnnotationTool | null>(null);

  useEffect(() => {
    if (!selectionProvides) return;

    return selectionProvides.forDocument(documentId).onSelectionChange(() => {
      setRects(selectionProvides.forDocument(documentId).getHighlightRectsForPage(pageIndex));
      setBoundingRect(selectionProvides.forDocument(documentId).getBoundingRectForPage(pageIndex));
    });
  }, [selectionProvides, documentId, pageIndex]);

  useEffect(() => {
    if (!annotationProvides) return;

    // Initialize with current active tool
    setActiveTool(annotationProvides.forDocument(documentId).getActiveTool());

    return annotationProvides
      .forDocument(documentId)
      .onActiveToolChange((event) => setActiveTool(event));
  }, [annotationProvides, documentId]);

  if (!boundingRect) return null;
  if (!activeTool || !activeTool.defaults) return null;

  switch (activeTool.defaults.type) {
    case PdfAnnotationSubtype.UNDERLINE:
      return (
        <div
          style={{
            mixBlendMode: blendModeToCss(activeTool.defaults?.blendMode ?? PdfBlendMode.Normal),
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
          }}
        >
          <Underline
            strokeColor={activeTool.defaults?.strokeColor}
            opacity={activeTool.defaults?.opacity}
            segmentRects={rects}
            scale={scale}
          />
        </div>
      );
    case PdfAnnotationSubtype.HIGHLIGHT:
      return (
        <div
          style={{
            mixBlendMode: blendModeToCss(activeTool.defaults?.blendMode ?? PdfBlendMode.Multiply),
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
          }}
        >
          <Highlight
            strokeColor={activeTool.defaults?.strokeColor}
            opacity={activeTool.defaults?.opacity}
            segmentRects={rects}
            scale={scale}
          />
        </div>
      );
    case PdfAnnotationSubtype.STRIKEOUT:
      return (
        <div
          style={{
            mixBlendMode: blendModeToCss(activeTool.defaults?.blendMode ?? PdfBlendMode.Normal),
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
          }}
        >
          <Strikeout
            strokeColor={activeTool.defaults?.strokeColor}
            opacity={activeTool.defaults?.opacity}
            segmentRects={rects}
            scale={scale}
          />
        </div>
      );
    case PdfAnnotationSubtype.SQUIGGLY:
      return (
        <div
          style={{
            mixBlendMode: blendModeToCss(activeTool.defaults?.blendMode ?? PdfBlendMode.Normal),
            pointerEvents: 'none',
            position: 'absolute',
            inset: 0,
          }}
        >
          <Squiggly
            strokeColor={activeTool.defaults?.strokeColor}
            opacity={activeTool.defaults?.opacity}
            segmentRects={rects}
            scale={scale}
          />
        </div>
      );
    default:
      return null;
  }
}
