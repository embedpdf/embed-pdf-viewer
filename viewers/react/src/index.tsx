import {
  useRef,
  useEffect,
  useImperativeHandle,
  forwardRef,
  type ForwardedRef,
  type CSSProperties,
} from 'react';
import EmbedPDF, {
  type EmbedPdfContainer,
  type PDFViewerConfig,
  type PluginRegistry,
} from '@embedpdf/snippet';

// Re-export everything from snippet for convenience
export * from '@embedpdf/snippet';

export interface PDFViewerProps {
  /** Full configuration for the PDF viewer */
  config?: PDFViewerConfig;
  /** CSS class name for the container div */
  className?: string;
  /** Inline styles for the container div */
  style?: CSSProperties;
  /** Callback when the viewer is initialized */
  onInit?: (container: EmbedPdfContainer) => void;
  /** Callback when the registry is ready */
  onReady?: (registry: PluginRegistry) => void;
}

export interface PDFViewerRef {
  /** The EmbedPdfContainer element */
  container: EmbedPdfContainer | null;
  /** Promise that resolves to the PluginRegistry */
  registry: Promise<PluginRegistry> | null;
}

/**
 * React component for embedding PDF documents
 *
 * @example
 * ```tsx
 * import { PDFViewer } from '@embedpdf/react-pdf-viewer';
 *
 * function App() {
 *   return (
 *     <PDFViewer
 *       config={{
 *         src: '/document.pdf',
 *         theme: { preference: 'system' },
 *       }}
 *       style={{ width: '100%', height: '100vh' }}
 *       onReady={(registry) => {
 *         console.log('PDF viewer ready', registry);
 *       }}
 *     />
 *   );
 * }
 * ```
 */
export const PDFViewer = forwardRef(function PDFViewer(
  props: PDFViewerProps,
  ref: ForwardedRef<PDFViewerRef>,
) {
  const { config = {}, className, style, onInit, onReady } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<EmbedPdfContainer | null>(null);

  useImperativeHandle(ref, () => ({
    get container() {
      return viewerRef.current;
    },
    get registry() {
      return viewerRef.current?.registry ?? null;
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    // Track if this effect instance is still active (for Strict Mode)
    let isActive = true;

    // IMPORTANT: Capture the container reference in a closure
    // This ensures we can clean up even after React unmounts the component
    const containerElement = containerRef.current;

    // Initialize the viewer with the config prop
    const viewer = EmbedPDF.init({
      type: 'container',
      target: containerElement,
      ...config,
    });

    if (viewer) {
      viewerRef.current = viewer;
      onInit?.(viewer);

      // Call onReady when registry is available, but only if still active
      if (onReady) {
        viewer.registry.then((registry) => {
          // Only call onReady if this effect instance is still active
          // This prevents stale callbacks in React Strict Mode
          if (isActive) {
            onReady(registry);
          }
        });
      }
    }

    return () => {
      // Mark this effect instance as inactive
      isActive = false;

      // Cleanup: remove the viewer element using captured reference
      // We use the captured containerElement instead of containerRef.current
      // because React may have already unmounted and cleared the ref
      containerElement.innerHTML = '';
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={style} />;
});

export default PDFViewer;
