<script lang="ts">
  import type { Tile } from '@embedpdf/plugin-tiling';
  import { useCoreState } from '@embedpdf/core/svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import TileImg from './TileImg.svelte';
  import { useTilingCapability } from '../hooks';

  type TilingLayoutProps = HTMLAttributes<HTMLDivElement> & {
    pageIndex: number;
    scale: number;
    class?: string;
  };

  let { pageIndex, scale, class: propsClass, ...restProps }: TilingLayoutProps = $props();

  const tilingCapability = useTilingCapability();
  let tiles = $state<Tile[]>([]);

  const core = useCoreState();

  $effect(() => {
    if (!tilingCapability.provides) return;
    return tilingCapability.provides.onTileRendering((tilesMap) => {
      tiles = tilesMap[pageIndex] ?? [];
    });
  });
</script>

<div class={propsClass} {...restProps}>
  {#each tiles as tile (`${core.coreState?.document?.id}-${tile.id}`)}
    <TileImg {pageIndex} {tile} dpr={window.devicePixelRatio} {scale} />
  {/each}
</div>
