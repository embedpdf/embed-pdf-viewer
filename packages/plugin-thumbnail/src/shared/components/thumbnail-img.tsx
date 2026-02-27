import { useEffect, useState, useRef, HTMLAttributes, CSSProperties } from '@framework';
import { ThumbMeta } from '@embedpdf/plugin-thumbnail';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useRegistry } from '@embedpdf/core/@framework';
import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';

type ThumbnailImgProps = Omit<HTMLAttributes<HTMLImageElement | HTMLCanvasElement>, 'style'> & {
  /**
   * The ID of the document that this thumbnail belongs to
   */
  documentId: string;
  style?: CSSProperties;
  meta: ThumbMeta;
};

export function ThumbImg({ documentId, meta, style, ...props }: ThumbnailImgProps) {
  const { provides: thumbs } = useThumbnailCapability();
  const { plugin: thumbnailPlugin } = useThumbnailPlugin();
  const { registry } = useRegistry();
  const logger = registry?.getLogger();

  const renderMode = thumbs?.renderMode ?? 'blob';

  // Blob mode state
  const [url, setUrl] = useState<string>();
  const urlRef = useRef<string | null>(null);

  // Bitmap mode state
  const [bitmapOutput, setBitmapOutput] = useState<ImageBitmap | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Perf tracking
  const perfIdRef = useRef<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!thumbnailPlugin) return;
    const scope = thumbnailPlugin.provides().forDocument(documentId);
    return scope.onRefreshPages((pages) => {
      if (pages.includes(meta.pageIndex)) {
        setRefreshTick((tick) => tick + 1);
      }
    });
  }, [thumbnailPlugin, documentId, meta.pageIndex]);

  // Blob mode effect
  useEffect(() => {
    if (renderMode !== 'blob') return;
    const scope = thumbs?.forDocument(documentId);

    const perfId = `thumb-${meta.pageIndex}-${Date.now()}`;
    perfIdRef.current = perfId;
    logger?.perf('ThumbImg', 'blob', 'render', 'Begin', perfId);

    const task = scope?.renderThumb(meta.pageIndex, window.devicePixelRatio);
    task?.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
    }, ignore);

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      } else {
        task?.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  }, [thumbs, documentId, meta.pageIndex, refreshTick, renderMode]);

  // Bitmap mode effect
  useEffect(() => {
    if (renderMode !== 'bitmap') return;
    const scope = thumbs?.forDocument(documentId);

    const perfId = `thumb-${meta.pageIndex}-${Date.now()}`;
    perfIdRef.current = perfId;
    logger?.perf('ThumbImg', 'bitmap', 'render', 'Begin', perfId);

    let resolved = false;
    const task = scope?.renderThumbBitmap(meta.pageIndex, window.devicePixelRatio);
    task?.wait((output) => {
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
        task?.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  }, [thumbs, documentId, meta.pageIndex, refreshTick, renderMode]);

  // Close bitmap on unmount only
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
    if (perfIdRef.current) {
      logger?.perf('ThumbImg', 'bitmap', 'render', 'End', perfIdRef.current);
      perfIdRef.current = null;
    }
  }, [bitmapOutput]);

  const handleImageLoad = () => {
    if (perfIdRef.current) {
      logger?.perf('ThumbImg', 'blob', 'render', 'End', perfIdRef.current);
      perfIdRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  if (renderMode === 'bitmap') {
    return bitmapOutput ? <canvas ref={canvasRef} style={style} {...props} /> : null;
  }

  return url ? <img src={url} onLoad={handleImageLoad} style={style} {...props} /> : null;
}
