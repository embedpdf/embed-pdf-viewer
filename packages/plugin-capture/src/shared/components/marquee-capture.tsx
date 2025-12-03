import { useEffect, useMemo, useState } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Rect } from '@embedpdf/models';

import { useCaptureCapability } from '../hooks/use-capture';

interface MarqueeCaptureProps {
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

export const MarqueeCapture = ({
  documentId,
  pageIndex,
  scale,
  className,
  stroke = 'rgba(33,150,243,0.8)',
  fill = 'rgba(33,150,243,0.15)',
}: MarqueeCaptureProps) => {
  const { provides: capturePlugin } = useCaptureCapability();
  const documentState = useDocumentState(documentId);
  const [rect, setRect] = useState<Rect | null>(null);

  const actualScale = useMemo(() => {
    if (scale !== undefined) return scale;
    return documentState?.scale ?? 1;
  }, [scale, documentState?.scale]);

  useEffect(() => {
    if (!capturePlugin) return;
    return capturePlugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      callback: {
        onPreview: setRect,
      },
    });
  }, [capturePlugin, documentId, pageIndex, actualScale]);

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
        border: `1px solid ${stroke}`,
        background: fill,
        boxSizing: 'border-box',
      }}
      className={className}
    />
  );
};
