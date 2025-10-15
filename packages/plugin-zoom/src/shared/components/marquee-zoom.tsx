import { useEffect, useState } from '@framework';
import { Rect } from '@embedpdf/models';
import { useZoomCapability } from '../hooks/use-zoom';

interface MarqueeZoomProps {
  documentId: string;
  pageIndex: number;
  scale: number;
  className?: string;
  stroke?: string;
  fill?: string;
}

export const MarqueeZoom = ({
  documentId,
  pageIndex,
  scale,
  className,
  stroke = 'rgba(33,150,243,0.8)',
  fill = 'rgba(33,150,243,0.15)',
}: MarqueeZoomProps) => {
  const { provides: zoomPlugin } = useZoomCapability();
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!zoomPlugin) return;
    return zoomPlugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale,
      callback: {
        onPreview: setRect,
      },
    });
  }, [zoomPlugin, documentId, pageIndex, scale]);

  if (!rect) return null;

  return (
    <div
      style={{
        position: 'absolute',
        pointerEvents: 'none',
        left: rect.origin.x * scale,
        top: rect.origin.y * scale,
        width: rect.size.width * scale,
        height: rect.size.height * scale,
        border: `1px solid ${stroke}`,
        background: fill,
        boxSizing: 'border-box',
      }}
      className={className}
    />
  );
};
