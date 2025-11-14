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

export function TileImg({ documentId, pageIndex, tile, dpr, scale }: TileImgProps) {
  const { provides: tilingCapability } = useTilingCapability();
  const scope = useMemo(
    () => tilingCapability?.forDocument(documentId),
    [tilingCapability, documentId],
  );

  const [url, setUrl] = useState<string>();
  const urlRef = useRef<string | null>(null);

  const relativeScale = scale / tile.srcScale;

  /* kick off render exactly once per tile */
  useEffect(() => {
    if (tile.status === 'ready' && urlRef.current) return; // already done
    if (!scope) return;
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
  }, [scope, pageIndex, tile.id]); // id includes scale, so unique

  const handleImageLoad = () => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  if (!url) return null; // could render a placeholder
  return (
    <img
      src={url}
      onLoad={handleImageLoad}
      style={{
        position: 'absolute',
        left: tile.screenRect.origin.x * relativeScale,
        top: tile.screenRect.origin.y * relativeScale,
        width: tile.screenRect.size.width * relativeScale,
        height: tile.screenRect.size.height * relativeScale,
        display: 'block',
      }}
    />
  );
}
