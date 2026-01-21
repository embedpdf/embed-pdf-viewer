import { useEffect, useMemo, useState } from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Rect } from '@embedpdf/models';

import { useSelectionPlugin } from '../hooks';

interface MarqueeSelectionProps {
  /** Document ID */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Scale of the page (optional, defaults to document scale) */
  scale?: number;
  /** Optional CSS class applied to the marquee rectangle */
  className?: string;
  /** Stroke colour (default: 'rgba(0,122,204,0.8)') */
  stroke?: string;
  /** Fill colour (default: 'rgba(0,122,204,0.15)') */
  fill?: string;
}

/**
 * MarqueeSelection renders a selection rectangle when the user drags to select items.
 * Place this component on each page where you want marquee selection to work.
 *
 * Other plugins (e.g., annotation, form) can subscribe to `onMarqueeEnd` to
 * determine which objects intersect with the marquee rect.
 */
export const MarqueeSelection = ({
  documentId,
  pageIndex,
  scale,
  className,
  stroke = 'rgba(0,122,204,0.8)',
  fill = 'rgba(0,122,204,0.15)',
}: MarqueeSelectionProps) => {
  const { plugin: selPlugin } = useSelectionPlugin();
  const documentState = useDocumentState(documentId);
  const [rect, setRect] = useState<Rect | null>(null);

  const actualScale = useMemo(() => {
    if (scale !== undefined) return scale;
    return documentState?.scale ?? 1;
  }, [scale, documentState?.scale]);

  const pageSize = useMemo(() => {
    const page = documentState?.document?.pages.find((p) => p.index === pageIndex);
    return page?.size ?? { width: 0, height: 0 };
  }, [documentState?.document?.pages, pageIndex]);

  useEffect(() => {
    if (!selPlugin || !documentId || pageSize.width === 0) return;

    return selPlugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      pageSize,
      scale: actualScale,
      onRectChange: setRect,
    });
  }, [selPlugin, documentId, pageIndex, pageSize, actualScale]);

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
