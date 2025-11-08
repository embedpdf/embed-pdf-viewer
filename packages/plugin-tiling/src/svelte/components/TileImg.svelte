<script lang="ts">
  import type { Tile } from '@embedpdf/plugin-tiling';
  import { useTilingCapability } from '../hooks';
  import { ignore, PdfErrorCode } from '@embedpdf/models';
  import { untrack } from 'svelte';

  interface TileImgProps {
    pageIndex: number;
    tile: Tile;
    dpr: number;
    scale: number;
  }

  let { pageIndex, tile, dpr, scale }: TileImgProps = $props();
  const tilingCapability = useTilingCapability();
  let url = $state<string>('');
  // urlRef is NOT reactive - similar to React's useRef
  let urlRef: string | null = null;

  // Capture these values once per tile change
  const tileId = $derived(tile.id);
  const tileSrcScale = $derived(tile.srcScale);
  const tileScreenRect = $derived(tile.screenRect);
  const relativeScale = $derived(scale / tileSrcScale);

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
    // Track only tileId and pageIndex as dependencies (like React's [pageIndex, tile.id])
    const _tileId = tileId;
    const _pageIndex = pageIndex;

    // Check if we already have a URL for this tile (already rendered)
    if (urlRef) return;

    if (!tilingCapability) return;

    // Clone to avoid reactive proxies that Web Workers cannot clone
    const plainTile = untrack(() => createPlainTile(tile));
    const task = tilingCapability.provides?.renderTile({
      pageIndex: _pageIndex,
      tile: plainTile,
      dpr,
    });
    task?.wait((blob) => {
      const objectUrl = URL.createObjectURL(blob);
      urlRef = objectUrl;
      url = objectUrl;
    }, ignore);

    return () => {
      if (urlRef) {
        URL.revokeObjectURL(urlRef);
        urlRef = null;
      } else {
        task?.abort({
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
    onload={handleImageLoad}
    style:position="absolute"
    style:left={`${tileScreenRect.origin.x * relativeScale}px`}
    style:top={`${tileScreenRect.origin.y * relativeScale}px`}
    style:width={`${tileScreenRect.size.width * relativeScale}px`}
    style:height={`${tileScreenRect.size.height * relativeScale}px`}
    style:display="block"
  />
{/if}
