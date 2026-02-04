import { useCallback, useRef } from '@framework';
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
  const documentIdRef = useRef(documentId);
  const itemIdRef = useRef(itemId);

  // Keep refs in sync
  documentIdRef.current = documentId;
  itemIdRef.current = itemId;

  // Return stable callback that uses refs
  return useCallback(
    (element: HTMLElement | null) => {
      // Store previous element
      const previousElement = elementRef.current;

      // Update ref
      elementRef.current = element;

      // Handle registration/unregistration
      if (element) {
        // Register new element
        if (element !== previousElement) {
          registry.register(documentIdRef.current, itemIdRef.current, element);
        }
      } else if (previousElement) {
        // Element is now null, but we had one before - unregister
        registry.unregister(documentIdRef.current, itemIdRef.current);
      }
    },
    [registry], // Only depend on registry!
  );
}
