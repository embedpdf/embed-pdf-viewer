<!--
  One tile: its place, and the shared browser binding (`bindPaintedImage`), which hides the
  image until it's complete, reports it painted after its first chance to show, and reports the
  inverse when it leaves the DOM.
-->
<script lang="ts" module>
  let warnedTileSize = false;
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { TilePaintSource } from '@embedpdf/plugin-render/contract/host';
  import { bindPaintedImage } from '@embedpdf/web';

  let {
    source,
    viewScale,
    fadeMs,
    onPainted,
    onUnpainted,
  }: {
    source: TilePaintSource;
    /** View pixels per page point: tiles are placed in view pixels. */
    viewScale: number;
    fadeMs: number;
    onPainted: () => void;
    onUnpainted: () => void;
  } = $props();

  let image: HTMLImageElement | undefined;

  // Bound per bitmap: the handle is the tile's identity. A new plan hands the same tile a new
  // `source` object; only a new handle binds again (a new URL, hidden until it has loaded).
  const handle = $derived(source.handle);
  $effect(() => {
    const picture = handle;
    if (!image) return;
    return untrack(() => bindPaintedImage(image!, picture, { onPainted, onUnpainted }));
  });

  /** A raster whose size disagrees with its box would be stretched into place: say so once. */
  function checkSize(event: Event) {
    const naturalWidth = (event.currentTarget as HTMLImageElement).naturalWidth;
    if (naturalWidth <= 0 || warnedTileSize) return;
    const expected = Math.round(source.rect.width * source.scale);
    if (Math.abs(naturalWidth - expected) > 1) {
      warnedTileSize = true;
      console.warn(
        `[render] tile bitmap ${naturalWidth}px wide does not match its rect ` +
          `(expected ~${expected}px) — stale raster identity? key=${source.key}`,
      );
    }
  }
</script>

<img
  bind:this={image}
  alt=""
  draggable="false"
  onload={checkSize}
  style:position="absolute"
  style:left="{source.rect.x * viewScale}px"
  style:top="{source.rect.y * viewScale}px"
  style:width="{source.rect.width * viewScale}px"
  style:height="{source.rect.height * viewScale}px"
  style:z-index={source.z}
  style:animation={fadeMs > 0 ? `epdf-tile-in ${fadeMs}ms ease-out` : undefined}
/>
