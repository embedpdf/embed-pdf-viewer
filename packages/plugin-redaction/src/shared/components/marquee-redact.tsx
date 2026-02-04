import { useEffect, useMemo, useState } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Rect } from '@embedpdf/models';

import { useRedactionPlugin } from '../hooks/use-redaction';

interface MarqueeRedactProps {
  /** The ID of the document */
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

export const MarqueeRedact = ({
  documentId,
  pageIndex,
  scale: scaleOverride,
  className,
  stroke,
  fill = 'transparent',
}: MarqueeRedactProps) => {
  const { plugin: redactionPlugin } = useRedactionPlugin();
  const documentState = useDocumentState(documentId);

  const [rect, setRect] = useState<Rect | null>(null);

  const scale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  // Get stroke color from plugin (annotation mode uses tool defaults, legacy uses red)
  // Allow prop override for backwards compatibility
  const strokeColor = stroke ?? redactionPlugin?.getPreviewStrokeColor() ?? 'red';

  useEffect(() => {
    if (!redactionPlugin || !documentId) return;
    return redactionPlugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale,
      callback: {
        onPreview: setRect,
      },
    });
  }, [redactionPlugin, documentId, pageIndex, scale]);

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
        border: `1px solid ${strokeColor}`,
        background: fill,
        boxSizing: 'border-box',
      }}
      className={className}
    />
  );
};
