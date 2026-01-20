import { useEffect, useMemo, useState } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Rect } from '@embedpdf/models';

import { useAnnotationCapability } from '../hooks';

interface MarqueeSelectionProps {
  /** Document ID */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Scale of the page */
  scale?: number;
  /** Optional CSS class applied to the marquee rectangle */
  className?: string;
  /** Stroke / fill colours (defaults below) */
  stroke?: string;
  fill?: string;
}

/**
 * MarqueeSelection renders a selection rectangle when the user drags to select annotations.
 * It follows the same pattern as MarqueeCapture from the capture plugin.
 */
export const MarqueeSelection = ({
  documentId,
  pageIndex,
  scale,
  className,
  stroke = 'rgba(0,122,204,0.8)',
  fill = 'rgba(0,122,204,0.15)',
}: MarqueeSelectionProps) => {
  const { provides: annotationPlugin } = useAnnotationCapability();
  const documentState = useDocumentState(documentId);
  const [rect, setRect] = useState<Rect | null>(null);

  const actualScale = useMemo(() => {
    if (scale !== undefined) return scale;
    return documentState?.scale ?? 1;
  }, [scale, documentState?.scale]);

  useEffect(() => {
    if (!annotationPlugin) return;

    return annotationPlugin.registerMarqueeSelectionOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      callback: {
        onPreview: setRect,
      },
    });
  }, [annotationPlugin, documentId, pageIndex, actualScale]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        left: rect.origin.x * actualScale,
        top: rect.origin.y * actualScale,
        width: rect.size.width * actualScale,
        height: rect.size.height * actualScale,
        border: `1px dashed ${stroke}`,
        background: fill,
        boxSizing: 'border-box',
        zIndex: 1000,
      }}
      className={className}
    />
  );
};
