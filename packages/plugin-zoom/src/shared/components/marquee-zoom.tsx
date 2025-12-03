import { useEffect, useMemo, useState } from '@framework';
import { Rect } from '@embedpdf/models';
import { useZoomCapability } from '../hooks/use-zoom';
import { useDocumentState } from '@embedpdf/core/@framework';

interface MarqueeZoomProps {
  documentId: string;
  pageIndex: number;
  scale?: number;
  className?: string;
  stroke?: string;
  fill?: string;
}

export const MarqueeZoom = ({
  documentId,
  pageIndex,
  scale: scaleOverride,
  className,
  stroke = 'rgba(33,150,243,0.8)',
  fill = 'rgba(33,150,243,0.15)',
}: MarqueeZoomProps) => {
  const { provides: zoomPlugin } = useZoomCapability();
  const documentState = useDocumentState(documentId);
  const [rect, setRect] = useState<Rect | null>(null);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  useEffect(() => {
    if (!zoomPlugin) return;
    return zoomPlugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      callback: {
        onPreview: setRect,
      },
    });
  }, [zoomPlugin, documentId, pageIndex, actualScale]);

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
