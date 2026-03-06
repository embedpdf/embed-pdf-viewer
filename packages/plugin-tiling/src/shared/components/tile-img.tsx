import { ignore, PdfErrorCode } from '@embedpdf/models';
import { Tile } from '@embedpdf/plugin-tiling';
import { useEffect, useMemo, useRef, useState } from '@framework';

import { useTilingCapability } from '../hooks/use-tiling';

interface TileImgProps {
  documentId: string;
  pageIndex: number;
  tile: Tile;
  dpr: number;
  scale: number;
}

function paintBitmap(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('bitmaprenderer')!.transferFromImageBitmap(bitmap);
  } catch {
    // Bitmap was detached
  }
}

export function TileImg({ documentId, pageIndex, tile, dpr, scale }: TileImgProps) {
  const { provides: tilingCapability } = useTilingCapability();
  const scope = useMemo(
    () => tilingCapability?.forDocument(documentId),
    [tilingCapability, documentId],
  );

  const relativeScale = scale / tile.srcScale;

  const [hasContent, setHasContent] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* kick off render exactly once per tile */
  useEffect(() => {
    if (!scope) return;

    let currentBitmap: ImageBitmap | null = null;
    const task = scope.renderTile({ pageIndex, tile, dpr });
    task.wait((output) => {
      currentBitmap = output;
      const canvas = canvasRef.current;
      if (canvas) {
        paintBitmap(canvas, output);
        currentBitmap = null; // transferred to canvas
        setHasContent(true);
      }
    }, ignore);

    return () => {
      task.abort({
        code: PdfErrorCode.Cancelled,
        message: 'canceled render task',
      });
      if (currentBitmap) {
        currentBitmap.close();
        currentBitmap = null;
      }
      setHasContent(false);
    };
  }, [scope, pageIndex, tile.id]);

  const positionStyle = {
    position: 'absolute' as const,
    left: tile.screenRect.origin.x * relativeScale,
    top: tile.screenRect.origin.y * relativeScale,
    width: tile.screenRect.size.width * relativeScale,
    height: tile.screenRect.size.height * relativeScale,
  };

  return (
    <canvas ref={canvasRef} style={{ ...positionStyle, display: hasContent ? 'block' : 'none' }} />
  );
}
