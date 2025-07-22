/** @jsxImportSource preact */
import { JSX } from 'preact';
import { blendModeToCss, PdfAnnotationSubtype, PdfBlendMode, Rect } from '@embedpdf/models';
import { ActiveTool, makeVariantKey } from '@embedpdf/plugin-annotation';
import { useSelectionCapability } from '@embedpdf/plugin-selection/preact';

import { useEffect, useState } from 'preact/hooks';
import { useAnnotationCapability } from '../hooks';
import { Highlight } from './text-markup/highlight';
import { Squiggly } from './text-markup/squiggly';
import { Underline } from './text-markup/underline';
import { Strikeout } from './text-markup/strikeout';

interface TextMarkupProps {
  pageIndex: number;
  scale: number;
}

export function TextMarkup({ pageIndex, scale }: TextMarkupProps) {
  const { provides: selectionProvides } = useSelectionCapability();
  const { provides: annotationProvides } = useAnnotationCapability();
  const [rects, setRects] = useState<Array<Rect>>([]);
  const [boundingRect, setBoundingRect] = useState<Rect | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>({ variantKey: null, defaults: null });

  useEffect(() => {
    if (!selectionProvides) return;

    const off = selectionProvides.onSelectionChange(() => {
      setRects(selectionProvides.getHighlightRectsForPage(pageIndex));
      setBoundingRect(selectionProvides.getBoundingRectForPage(pageIndex));
    });
    return off;
  }, [selectionProvides, pageIndex]);

  useEffect(() => {
    if (!annotationProvides) return;

    const off = annotationProvides.onActiveToolChange(setActiveTool);
    return off;
  }, [annotationProvides]);

  if (!boundingRect) return null;

  switch (activeTool.variantKey) {
    case makeVariantKey(PdfAnnotationSubtype.UNDERLINE):
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
            color={activeTool.defaults?.color}
            opacity={activeTool.defaults?.opacity}
            rects={rects}
            scale={scale}
          />
        </div>
      );
    case makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT):
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
            color={activeTool.defaults?.color}
            opacity={activeTool.defaults?.opacity}
            rects={rects}
            scale={scale}
          />
        </div>
      );
    case makeVariantKey(PdfAnnotationSubtype.STRIKEOUT):
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
            color={activeTool.defaults?.color}
            opacity={activeTool.defaults?.opacity}
            rects={rects}
            scale={scale}
          />
        </div>
      );
    case makeVariantKey(PdfAnnotationSubtype.SQUIGGLY):
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
            color={activeTool.defaults?.color}
            opacity={activeTool.defaults?.opacity}
            rects={rects}
            scale={scale}
          />
        </div>
      );
    default:
      return null;
  }
}
