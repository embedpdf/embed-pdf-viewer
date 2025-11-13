import { useCallback, useEffect, useRef } from '@framework';
import { useAnchorRegistry } from '../registries/anchor-registry';

/**
 * Register a DOM element as an anchor for menus
 *
 * @param documentId - Document ID
 * @param itemId - Item ID (typically matches the toolbar/menu item ID)
 * @returns Ref callback to attach to the element
 *
 * @example
 * ```tsx
 * function ZoomButton({ documentId }: Props) {
 *   const anchorRef = useRegisterAnchor(documentId, 'zoom-button');
 *
 *   return <button ref={anchorRef}>Zoom</button>;
 * }
 * ```
 */
export function useRegisterAnchor(
  documentId: string,
  itemId: string,
): (element: HTMLElement | null) => void {
  const registry = useAnchorRegistry();
  const elementRef = useRef<HTMLElement | null>(null);

  // Cleanup on unmount or when IDs change
  useEffect(() => {
    return () => {
      if (elementRef.current) {
        registry.unregister(documentId, itemId);
      }
    };
  }, [registry, documentId, itemId]);

  return useCallback(
    (element: HTMLElement | null) => {
      // Unregister previous element if any
      if (elementRef.current) {
        registry.unregister(documentId, itemId);
      }

      elementRef.current = element;

      // Register new element
      if (element) {
        registry.register(documentId, itemId, element);
      }
    },
    [registry, documentId, itemId],
  );
}
