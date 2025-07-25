import {
  ReactNode,
  useEffect,
  useRef,
  useCallback,
  HTMLAttributes,
  CSSProperties,
} from '@framework';
import { Position, restorePosition } from '@embedpdf/models';
import { createPointerProvider } from '../utils';

import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

interface PagePointerProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  scale: number;
  style?: CSSProperties;
  convertEventToPoint?: (event: PointerEvent, element: HTMLElement) => Position;
}

export const PagePointerProvider = ({
  pageIndex,
  children,
  pageWidth,
  pageHeight,
  rotation,
  scale,
  convertEventToPoint,
  style,
  ...props
}: PagePointerProviderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { provides: cap } = useInteractionManagerCapability();
  const isPageExclusive = useIsPageExclusive();

  // Memoize the default conversion function
  const defaultConvertEventToPoint = useCallback(
    (event: PointerEvent, element: HTMLElement): Position => {
      const rect = element.getBoundingClientRect();
      const displayPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      return restorePosition(
        { width: pageWidth, height: pageHeight },
        displayPoint,
        rotation,
        scale,
      );
    },
    [pageWidth, pageHeight, rotation, scale],
  );

  useEffect(() => {
    if (!cap || !ref.current) return;

    return createPointerProvider(
      cap,
      { type: 'page', pageIndex },
      ref.current,
      convertEventToPoint || defaultConvertEventToPoint,
    );
  }, [cap, pageIndex, convertEventToPoint, defaultConvertEventToPoint]);

  return (
    <div
      ref={ref}
      style={{
        ...style,
      }}
      {...props}
    >
      {children}
      {isPageExclusive && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }} />
      )}
    </div>
  );
};
