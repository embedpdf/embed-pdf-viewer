import { Fragment, useEffect, useRef, useState, useMemo } from '@framework';
import type { CSSProperties, HTMLAttributes } from '@framework';

import { ignore, PdfErrorCode } from '@embedpdf/models';

import { useRenderCapability } from '../hooks/use-render';
import { useDocumentState } from '@embedpdf/core/@framework';
import { useRegistry } from '@embedpdf/core/@framework';

type RenderLayerProps = Omit<HTMLAttributes<HTMLImageElement | HTMLCanvasElement>, 'style'> & {
  /**
   * The ID of the document to render from
   */
  documentId: string;
  /**
   * The page index to render (0-based)
   */
  pageIndex: number;
  /**
   * Optional scale override. If not provided, uses document's current scale.
   */
  scale?: number;
  /**
   * Optional device pixel ratio override. If not provided, uses window.devicePixelRatio.
   */
  dpr?: number;
  /**
   * Additional styles for the image element
   */
  style?: CSSProperties;
};

/**
 * RenderLayer Component
 *
 * Renders a PDF page with smart prop handling:
 * - If scale/dpr/rotation props are provided, they override document state
 * - If not provided, component uses document's current state values
 * - Automatically re-renders when:
 *   1. Document state changes (scale, rotation)
 *   2. Page is refreshed (via REFRESH_PAGES action in core)
 *
 * Supports two render modes:
 * - blob (default): renders via <img> with object URL
 * - bitmap: renders via <canvas> with ImageBitmap
 */
export function RenderLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  dpr: dprOverride,
  style,
  ...props
}: RenderLayerProps) {
  const { provides: renderProvides } = useRenderCapability();
  const documentState = useDocumentState(documentId);
  const { registry } = useRegistry();
  const logger = registry?.getLogger();

  const renderMode = renderProvides?.renderMode ?? 'blob';

  // Blob mode state
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  // Bitmap mode state
  const [bitmapOutput, setBitmapOutput] = useState<ImageBitmap | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Perf tracking id for the current render
  const perfIdRef = useRef<string | null>(null);

  // Get refresh version from core state
  const refreshVersion = useMemo(() => {
    if (!documentState) return 0;
    return documentState.pageRefreshVersions[pageIndex] || 0;
  }, [documentState, pageIndex]);

  // Determine actual render options: use overrides if provided, otherwise fall back to document state
  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  const actualDpr = useMemo(() => {
    if (dprOverride !== undefined) return dprOverride;
    return window.devicePixelRatio;
  }, [dprOverride]);

  // Blob mode effect
  useEffect(() => {
    if (!renderProvides || renderMode !== 'blob') return;

    const perfId = `page-${pageIndex}-${Date.now()}`;
    perfIdRef.current = perfId;
    logger?.perf('RenderLayer', 'blob', 'render', 'Begin', perfId);

    const task = renderProvides.forDocument(documentId).renderPage({
      pageIndex,
      options: {
        scaleFactor: actualScale,
        dpr: actualDpr,
      },
    });

    task.wait((blob) => {
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      urlRef.current = url;
    }, ignore);

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  }, [documentId, pageIndex, actualScale, actualDpr, renderProvides, refreshVersion, renderMode]);

  // Bitmap mode effect
  useEffect(() => {
    if (!renderProvides || renderMode !== 'bitmap') return;

    const perfId = `page-${pageIndex}-${Date.now()}`;
    perfIdRef.current = perfId;
    logger?.perf('RenderLayer', 'bitmap', 'render', 'Begin', perfId);

    let resolved = false;
    const task = renderProvides.forDocument(documentId).renderPageBitmap({
      pageIndex,
      options: {
        scaleFactor: actualScale,
        dpr: actualDpr,
      },
    });

    task.wait((output) => {
      resolved = true;
      // Close any superseded bitmap that was never painted
      if (bitmapRef.current) {
        bitmapRef.current.close();
      }
      bitmapRef.current = output;
      setBitmapOutput(output);
    }, ignore);

    return () => {
      if (!resolved) {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  }, [documentId, pageIndex, actualScale, actualDpr, renderProvides, refreshVersion, renderMode]);

  useEffect(() => {
    return () => {
      if (bitmapRef.current) {
        bitmapRef.current.close();
        bitmapRef.current = null;
      }
    };
  }, []);

  // Paint bitmap to canvas
  useEffect(() => {
    if (!bitmapOutput || !canvasRef.current) return;
    try {
      const canvas = canvasRef.current;
      canvas.width = bitmapOutput.width;
      canvas.height = bitmapOutput.height;
      canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmapOutput);
    } catch {
      // Bitmap was detached (closed between render and paint)
      return;
    }
    bitmapRef.current = null;
    // Bitmap is displayed now
    if (perfIdRef.current) {
      logger?.perf('RenderLayer', 'bitmap', 'render', 'End', perfIdRef.current);
      perfIdRef.current = null;
    }
  }, [bitmapOutput]);

  const handleImageLoad = () => {
    // Image is displayed now
    if (perfIdRef.current) {
      logger?.perf('RenderLayer', 'blob', 'render', 'End', perfIdRef.current);
      perfIdRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const elementStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    ...(style || {}),
  };

  if (renderMode === 'bitmap') {
    return (
      <Fragment>
        <canvas ref={canvasRef} {...props} style={elementStyle} />
      </Fragment>
    );
  }

  return (
    <Fragment>
      {imageUrl && <img src={imageUrl} onLoad={handleImageLoad} {...props} style={elementStyle} />}
    </Fragment>
  );
}
