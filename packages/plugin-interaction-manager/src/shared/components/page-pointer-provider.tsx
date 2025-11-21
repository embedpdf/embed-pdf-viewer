import {
  ReactNode,
  useEffect,
  useRef,
  useCallback,
  HTMLAttributes,
  CSSProperties,
} from '@framework';
import { useDocumentState } from '@embedpdf/core/@framework';
import { Position, restorePosition, Size, transformSize } from '@embedpdf/models';
import { createPointerProvider } from '../utils';

import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

interface PagePointerProviderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  documentId: string;
  pageIndex: number;
  rotation?: number;
  scale?: number;
  style?: CSSProperties;
  convertEventToPoint?: (event: PointerEvent, element: HTMLElement) => Position;
}

export const PagePointerProvider = ({
  documentId,
  pageIndex,
  children,
  rotation: rotationOverride,
  scale: scaleOverride,
  convertEventToPoint,
  style,
  ...props
}: PagePointerProviderProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const { provides: cap } = useInteractionManagerCapability();
  const isPageExclusive = useIsPageExclusive(documentId);
  const documentState = useDocumentState(documentId);

  // Get page dimensions and transformations from document state
  // Calculate inline - this is cheap and memoization isn't necessary
  const page = documentState?.document?.pages?.[pageIndex];
  const naturalPageSize = page?.size ?? { width: 0, height: 0 };
  const rotation = rotationOverride ?? documentState?.rotation ?? 0;
  const scale = scaleOverride ?? documentState?.scale ?? 1;
  const displaySize = transformSize(naturalPageSize, 0, scale);

  // Simplified conversion function
  const defaultConvertEventToPoint = useCallback(
    (event: PointerEvent, element: HTMLElement): Position => {
      const rect = element.getBoundingClientRect();
      const displayPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };

      // Get the rotated natural size (width/height may be swapped, but not scaled)
      const rotatedNaturalSize = transformSize(
        {
          width: displaySize.width,
          height: displaySize.height,
        },
        rotation,
        1,
      );

      return restorePosition(rotatedNaturalSize, displayPoint, rotation, scale);
    },
    [naturalPageSize, rotation, scale],
  );

  useEffect(() => {
    if (!cap || !ref.current) return;

    return createPointerProvider(
      cap,
      { type: 'page', documentId, pageIndex },
      ref.current,
      convertEventToPoint || defaultConvertEventToPoint,
    );
  }, [cap, documentId, pageIndex, convertEventToPoint, defaultConvertEventToPoint]);

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: displaySize.width,
        height: displaySize.height,
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
