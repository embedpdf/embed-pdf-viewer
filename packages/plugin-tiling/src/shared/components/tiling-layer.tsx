import { Tile } from '@embedpdf/plugin-tiling';
import { useEffect, useState, HTMLAttributes, CSSProperties, useMemo } from '@framework';

import { TileImg } from './tile-img';
import { useTilingCapability } from '../hooks/use-tiling';
import { useDocumentState } from '@embedpdf/core/@framework';

type TilingLayoutProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  documentId: string;
  pageIndex: number;
  scale?: number;
  style?: CSSProperties;
};

export function TilingLayer({
  documentId,
  pageIndex,
  scale: scaleOverride,
  style,
  ...props
}: TilingLayoutProps) {
  const { provides: tilingProvides } = useTilingCapability();
  const documentState = useDocumentState(documentId);
  const [tiles, setTiles] = useState<Tile[]>([]);

  useEffect(() => {
    if (tilingProvides) {
      return tilingProvides.onTileRendering((event) => {
        if (event.documentId === documentId) {
          setTiles(event.tiles[pageIndex] ?? []);
        }
      });
    }
  }, [tilingProvides, documentId, pageIndex]);

  const actualScale = useMemo(() => {
    if (scaleOverride !== undefined) return scaleOverride;
    return documentState?.scale ?? 1;
  }, [scaleOverride, documentState?.scale]);

  return (
    <div
      style={{
        ...style,
      }}
      {...props}
    >
      {tiles?.map((tile) => (
        <TileImg
          key={tile.id}
          documentId={documentId}
          pageIndex={pageIndex}
          tile={tile}
          dpr={window.devicePixelRatio}
          scale={actualScale}
        />
      ))}
    </div>
  );
}
