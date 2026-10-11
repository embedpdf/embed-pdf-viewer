<!--
  The layer's own drawing of one annotation, inside its frame: the engine's raster where the core
  places it (following a move as it happens), or the vector scene for everything drawn live (a
  picture older than the annotation too). One rule picks (`pictureOrPainting`). A renderer gets it
  as `native`.
-->
<script lang="ts">
  import { drawsLive, type RenderItem } from '@embedpdf/core-annotation';
  import {
    pictureOrPainting,
    rasterInFrame,
    shownAppearance,
    type AppearanceUrl,
  } from '@embedpdf/web';
  import AnnotationScene from './AnnotationScene.svelte';

  let {
    item,
    urls,
  }: {
    item: RenderItem;
    /** The page's loaded pictures, by item and state; `null` until the first ones arrive. */
    urls: Readonly<Record<string, AppearanceUrl>> | null;
  } = $props();

  const shows = $derived(
    pictureOrPainting({
      pending: item.source !== 'baked',
      picture: urls && shownAppearance(urls, item.id, item.annotation?.appearanceState ?? null),
      version: item.pictureVersion ?? 0,
      loaded: urls !== null,
      paint: () =>
        item.source !== 'baked' || (item.annotation && drawsLive(item.annotation)) ? item : null,
    }),
  );
  const raster = $derived(item.raster ? rasterInFrame(item.raster, item.frame) : null);
</script>

{#if shows?.kind === 'painting'}
  <!-- Shapes, clouds, markup: all painted from the scene. -->
  <AnnotationScene {item} />
{:else if shows?.kind === 'picture' && raster}
  <!-- The raster at any frame size. Explicit `max-width`/`max-height`: a global
       `img { max-width: 100% }` reset would clamp a box wider than its containing block (a
       landscape stamp on a turned portrait page) and distort it. The turn the engine took out of
       the raster is put back about its middle. -->
  <img
    src={shows.picture.url}
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
