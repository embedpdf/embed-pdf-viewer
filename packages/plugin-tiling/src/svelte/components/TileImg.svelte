<script lang="ts">
  import type { Tile } from '@embedpdf/plugin-tiling';
  import { useTilingCapability } from '../hooks';
  import { ignore, PdfErrorCode } from '@embedpdf/models';

  interface TileImgProps {
    pageIndex: number;
    tile: Tile;
    dpr: number;
    scale: number;
  }

  let { pageIndex, tile, dpr, scale }: TileImgProps = $props();
  const { provides: tilingCapability } = $derived(useTilingCapability());
  let url = $state<string>('');
  let urlRef = $state<string | null>(null);

  const relativeScale = scale / tile.srcScale;

  
  const createPlainTile = (t: Tile): Tile => ({
    ...t,
    pageRect: {
      origin: { x: t.pageRect.origin.x, y: t.pageRect.origin.y },
      size: { width: t.pageRect.size.width, height: t.pageRect.size.height },
    },
    screenRect: {
      origin: { x: t.screenRect.origin.x, y: t.screenRect.origin.y },
      size: { width: t.screenRect.size.width, height: t.screenRect.size.height },
    },
  });

  /* kick off render exactly once per tile */
  $effect(() => {
    // use tile.id as effect dependency
    const _tileId = tile.id;

    if (tile.status === 'ready' && urlRef) return; // already done
    if (!tilingCapability) return;

    // clone to avoid reactive proxies that Web Workers cannot clone
    const plainTile = createPlainTile(tile);
    const task = tilingCapability.renderTile({ pageIndex, tile: plainTile, dpr });
    task.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef = objectUrl;
      url = objectUrl;
    }, ignore);

    return () => {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      } else {
        task.abort({
          code: PdfErrorCode.Cancelled,
          message: 'canceled render task',
        });
      }
    };
  });

  const handleImageLoad = () => {
    if (urlRef) {
      URL.revokeObjectURL(urlRef);
      urlRef = null;
    }
  };
</script>

{#if url}
  <img
    src={url}
    alt=""
    onLoad={handleImageLoad}
    style:postion="absolute"
    style:left={`${tile.screenRect.origin.x * relativeScale}px`}
    style:top={`${tile.screenRect.origin.y * relativeScale}px`}
    style:width={`${tile.screenRect.size.width * relativeScale}px`}
    style:height={`${tile.screenRect.size.height * relativeScale}px`}
    style:display="block"
  />
{/if}
