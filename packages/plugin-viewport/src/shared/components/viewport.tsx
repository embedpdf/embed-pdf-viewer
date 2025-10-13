import { ReactNode, useEffect, useState, HTMLAttributes } from '@framework';
import { useViewportCapability } from '../hooks';
import { useViewportRef } from '../hooks/use-viewport-ref';

type ViewportProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /**
   * The ID of the document that this viewport displays
   */
  documentId: string;
};

export function Viewport({ children, documentId, ...props }: ViewportProps) {
  const [viewportGap, setViewportGap] = useState(0);
  const viewportRef = useViewportRef(documentId);
  const { provides: viewportProvides } = useViewportCapability();

  useEffect(() => {
    if (viewportProvides) {
      setViewportGap(viewportProvides.getViewportGap());
    }
  }, [viewportProvides]);

  const { style, ...restProps } = props;
  return (
    <div
      {...restProps}
      ref={viewportRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'auto',
        ...(typeof style === 'object' ? style : {}),
        padding: `${viewportGap}px`,
      }}
    >
      {children}
    </div>
  );
}
