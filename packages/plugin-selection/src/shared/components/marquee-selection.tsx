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
  /** Fill/background color inside the marquee rectangle. Default: 'rgba(0,122,204,0.15)' */
  background?: string;
  /** Border color of the marquee rectangle. Default: 'rgba(0,122,204,0.8)' */
  borderColor?: string;
  /** Border style. Default: 'dashed' */
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  /**
   * @deprecated Use `borderColor` instead.
   */
  stroke?: string;
  /**
   * @deprecated Use `background` instead.
   */
  fill?: string;
}

/**
 * MarqueeSelection renders a selection rectangle when the user drags to select items.
 * It registers the marquee handler on the page.
 *
 * Other plugins (e.g., annotation, form, redaction) can subscribe to `onMarqueeEnd` to
 * determine which objects intersect with the marquee rect.
 *
 * Use this component directly for advanced cases, or use `SelectionLayer`
 * which composes both `TextSelection` and `MarqueeSelection`.
 */
export const MarqueeSelection = ({
  documentId,
  pageIndex,
  scale,
  className,
  background,
  borderColor,
  borderStyle = 'dashed',
  stroke,
  fill,
}: MarqueeSelectionProps) => {
  const { plugin: selPlugin } = useSelectionPlugin();
  const documentState = useDocumentState(documentId);
  const [rect, setRect] = useState<Rect | null>(null);

  // Resolve deprecated props: new CSS-standard props take precedence
  const resolvedBorderColor = borderColor ?? stroke ?? 'rgba(0,122,204,0.8)';
  const resolvedBackground = background ?? fill ?? 'rgba(0,122,204,0.15)';

  const actualScale = useMemo(() => {
    if (scale !== undefined) return scale;
    return documentState?.scale ?? 1;
  }, [scale, documentState?.scale]);

  useEffect(() => {
    if (!selPlugin || !documentId) return;

    return selPlugin.registerMarqueeOnPage({
      documentId,
      pageIndex,
      scale: actualScale,
      onRectChange: setRect,
    });
  }, [selPlugin, documentId, pageIndex, actualScale]);

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
        border: `1px ${borderStyle} ${resolvedBorderColor}`,
        background: resolvedBackground,
        boxSizing: 'border-box',
        zIndex: 1000,
      }}
      className={className}
    />
  );
};
