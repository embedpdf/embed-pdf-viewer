import { ignore, PdfErrorCode } from '@embedpdf/models';
import { Tile } from '@embedpdf/plugin-tiling';
import { useEffect, useMemo, useRef, useState } from '@framework';
import { useRegistry } from '@embedpdf/core/@framework';

import { useTilingCapability } from '../hooks/use-tiling';

interface TileImgProps {
  documentId: string;
  pageIndex: number;
  tile: Tile;
  dpr: number;
  scale: number;
}

export function TileImg({ documentId, pageIndex, tile, dpr, scale }: TileImgProps) {
  const { provides: tilingCapability } = useTilingCapability();
  const { registry } = useRegistry();
  const logger = registry?.getLogger();
  const scope = useMemo(
    () => tilingCapability?.forDocument(documentId),
    [tilingCapability, documentId],
  );

  const renderMode = scope?.renderMode ?? 'blob';
  const relativeScale = scale / tile.srcScale;

  // Blob mode state
  const [url, setUrl] = useState<string>();
  const urlRef = useRef<string | null>(null);

  // Bitmap mode state
  const [bitmapOutput, setBitmapOutput] = useState<ImageBitmap | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Perf tracking
  const perfIdRef = useRef<string | null>(null);

  /* kick off render exactly once per tile */
  useEffect(() => {
    if (renderMode !== 'blob') return;
    if (tile.status === 'ready' && urlRef.current) return;
    if (!scope) return;

    const perfId = `tile-${tile.id}-${Date.now()}`;
    perfIdRef.current = perfId;
    logger?.perf('TileImg', 'blob', 'render', 'Begin', perfId);

    const task = scope.renderTile({ pageIndex, tile, dpr });
    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef.current = objectUrl;
      setUrl(objectUrl);
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
  }, [scope, pageIndex, tile.id, renderMode]);

  // Bitmap mode effect
  useEffect(() => {
    if (renderMode !== 'bitmap') return;
    if (tile.status === 'ready' && bitmapRef.current) return;
    if (!scope) return;

    const perfId = `tile-${tile.id}-${Date.now()}`;
    perfIdRef.current = perfId;
    logger?.perf('TileImg', 'bitmap', 'render', 'Begin', perfId);

    let resolved = false;
    const task = scope.renderTileBitmap({ pageIndex, tile, dpr });
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
  }, [scope, pageIndex, tile.id, renderMode]);

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
      logger?.perf('TileImg', 'bitmap', 'render', 'End', perfIdRef.current);
      perfIdRef.current = null;
    }
  }, [bitmapOutput]);

  const handleImageLoad = () => {
    if (perfIdRef.current) {
      logger?.perf('TileImg', 'blob', 'render', 'End', perfIdRef.current);
      perfIdRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  const positionStyle = {
    position: 'absolute' as const,
    left: tile.screenRect.origin.x * relativeScale,
    top: tile.screenRect.origin.y * relativeScale,
    width: tile.screenRect.size.width * relativeScale,
    height: tile.screenRect.size.height * relativeScale,
    display: 'block',
  };

  if (renderMode === 'bitmap') {
    if (!bitmapOutput) return null;
    return <canvas ref={canvasRef} style={positionStyle} />;
  }

  if (!url) return null;
  return <img src={url} onLoad={handleImageLoad} style={positionStyle} />;
}
