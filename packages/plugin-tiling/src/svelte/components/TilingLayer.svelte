<script lang="ts">
  import type { Tile } from '@embedpdf/plugin-tiling';
  import { useDocumentState } from '@embedpdf/core/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import TileImg from './TileImg.svelte';
  import { useTilingCapability } from '../hooks';

  type TilingLayoutProps = HTMLAttributes<HTMLDivElement> & {
    documentId: string;
    pageIndex: number;
    scale?: number;
    class?: string;
  };

  let {
    documentId,
    pageIndex,
    scale: scaleOverride,
    class: propsClass,
    ...restProps
  }: TilingLayoutProps = $props();

  const tilingCapability = useTilingCapability();
  const documentState = useDocumentState(documentId);

  let tiles = $state<Tile[]>([]);

  const actualScale = $derived(
    scaleOverride !== undefined ? scaleOverride : (documentState.current?.scale ?? 1),
  );

  $effect(() => {
    if (!tilingCapability.provides) return;
    return tilingCapability.provides.onTileRendering((event) => {
      if (event.documentId === documentId) {
        tiles = event.tiles[pageIndex] ?? [];
      }
    });
  });
</script>

<div class={propsClass} {...restProps}>
  {#each tiles as tile (tile.id)}
    <TileImg {documentId} {pageIndex} {tile} dpr={window.devicePixelRatio} scale={actualScale} />
  {/each}
</div>
