import { ReactNode, HTMLAttributes, CSSProperties, useMemo } from '@framework';
import { useZoomGesture, ZoomGestureOptions } from '../hooks';

type ZoomGestureWrapperProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  children: ReactNode;
  documentId: string;
  style?: CSSProperties;
  /** Enable pinch-to-zoom gesture (default: true) */
  enablePinch?: boolean;
  /** Enable wheel zoom with ctrl/cmd key (default: true) */
  enableWheel?: boolean;
  /** Override wheel zoom step; 0.1 = 10% (default: 0.1) */
  zoomStep?: number;
};

export function ZoomGestureWrapper({
  children,
  documentId,
  style,
  enablePinch = true,
  enableWheel = true,
  zoomStep = 0.1,
  ...props
}: ZoomGestureWrapperProps) {
  const options = useMemo<ZoomGestureOptions>(
    () => ({ enablePinch, enableWheel, zoomStep }),
    [enablePinch, enableWheel, zoomStep],
  );
  const { elementRef } = useZoomGesture(documentId, options);

  return (
    <div
      ref={elementRef}
      {...props}
      style={{
        ...style,
        display: 'inline-block',
        overflow: 'visible',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}
