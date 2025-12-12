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

    // Initialize the viewer with the config prop
    const viewer = EmbedPDF.init({
      type: 'container',
      target: containerRef.current,
      ...config,
    });

    if (viewer) {
      viewerRef.current = viewer;
      onInit?.(viewer);

      // Call onReady when registry is available
      if (onReady) {
        viewer.registry.then(onReady);
      }
    }

    return () => {
      // Cleanup: remove the viewer element
      if (viewerRef.current && containerRef.current) {
        containerRef.current.innerHTML = '';
        viewerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={className} style={style} />;
});

export default PDFViewer;
