<script lang="ts">
  import type { Tile } from '@embedpdf/plugin-tiling';
  import type { HTMLAttributes } from 'svelte/elements';
  import TileImg from './TileImg.svelte';
  import { useTilingCapability } from '../hooks';
  import {useCoreState} from "@embedpdf/core/svelte";

  type TilingLayoutProps = HTMLAttributes<HTMLDivElement> & {
    pageIndex: number;
    scale: number;
    class?: string;
  };

  let { pageIndex, scale, class: propsClass, ...restProps }: TilingLayoutProps = $props();

  const { provides: tilingProvides } = $derived(useTilingCapability());
  let tiles = $state<Tile[]>([]);

  let { coreState } = $derived(useCoreState());

  $effect(() => {
    if (!tilingProvides) return;
    return tilingProvides.onTileRendering((tilesMap) => {
      const pageTiles = tilesMap[pageIndex] ?? [];
    });
  });
</script>

<div class={propsClass} {...restProps}>
  {#each tiles as tile (`${coreState.document?.id}-${tile.id}`)}
    <TileImg {pageIndex} {tile} dpr={window.devicePixelRatio} {scale} />
  {/each}
</div>
