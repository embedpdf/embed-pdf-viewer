<!--
  The layer's own drawing of one annotation, inside its frame: the engine's raster where the core
  places it (following a move as it happens), or the vector scene. A renderer gets it as `native`.
-->
<script lang="ts">
  import type { RenderItem } from '@embedpdf/core-annotation';
  import { rasterInFrame } from '@embedpdf/web';
  import AnnotationScene from './AnnotationScene.svelte';

  let { item, url }: { item: RenderItem; url: string | null } = $props();

  const raster = $derived(
    item.source === 'baked' && item.raster ? rasterInFrame(item.raster, item.frame) : null,
  );
</script>

{#if item.source !== 'baked'}
  <!-- Shapes, clouds, markup: all painted from the scene. -->
  <AnnotationScene {item} />
{:else if url && raster}
  <!-- The raster at any frame size. Explicit `max-width`/`max-height`: a global
       `img { max-width: 100% }` reset would clamp a box wider than its containing block (a
       landscape stamp on a turned portrait page) and distort it. The turn the engine took out of
       the raster is put back about its middle. -->
  <img
    src={url}
    alt=""
    draggable="false"
    style:position="absolute"
    style:left={raster.left}
    style:top={raster.top}
    style:width={raster.width}
    style:height={raster.height}
    style:max-width="none"
    style:max-height="none"
    style:pointer-events="none"
    style:transform={raster.transform}
    style:transform-origin="center"
  />
{/if}
