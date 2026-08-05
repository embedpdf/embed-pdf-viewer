import { useEffect, useState, useRef, HTMLAttributes, CSSProperties } from '@framework';
import { ThumbMeta } from '@embedpdf/plugin-thumbnail';
import { ignore, PdfErrorCode } from '@embedpdf/models';
import { useThumbnailCapability, useThumbnailPlugin } from '../hooks';

type ThumbnailImgProps = Omit<HTMLAttributes<HTMLCanvasElement>, 'style'> & {
  /**
   * The ID of the document that this thumbnail belongs to
   */
  documentId: string;
  style?: CSSProperties;
  meta: ThumbMeta;
};

function paintBitmap(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  } catch {
    // Bitmap was closed (e.g. LRU eviction)
  }
}

export function ThumbImg({ documentId, meta, style, ...props }: ThumbnailImgProps) {
  const { provides: thumbs } = useThumbnailCapability();
  const { plugin: thumbnailPlugin } = useThumbnailPlugin();

  const [hasContent, setHasContent] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  // Bitmap render effect
  useEffect(() => {
    const scope = thumbs?.forDocument(documentId);
    const task = scope?.renderThumb(meta.pageIndex, window.devicePixelRatio);
    task?.wait((output) => {
      const canvas = canvasRef.current;
      if (canvas) {
        paintBitmap(canvas, output);
        setHasContent(true);
      }
    }, ignore);

    return () => {
      task?.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
    };
  }, [thumbs, documentId, meta.pageIndex, refreshTick]);

  // Do NOT close bitmap — LRU cache owns lifecycle

  return (
    <canvas
      ref={canvasRef}
      style={{ ...style, visibility: hasContent ? 'visible' : 'hidden' }}
      {...props}
    />
  );
}
