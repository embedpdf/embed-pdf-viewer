<!--
  One tile: its place in view space, and the shared browser image binding,
  which hides the image until it is complete, reports painted after its first
  chance to be shown, and reports the inverse when it leaves.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CSSProperties } from 'vue';
import type { PageRef } from '@embedpdf/core';
import type { TilePaintSource, ViewDemand } from '@embedpdf/plugin-render/contract/host';
import { bindPaintedImage } from '@embedpdf/web';
import { devWarn } from '../dev';

const props = defineProps<{
  source: TilePaintSource;
  /** The view's tile surface, told when this tile is painted and when it leaves. */
  view: ViewDemand;
  page: PageRef;
  /** View px per page point. */
  viewScale: number;
  fadeMs: number;
}>();

const image = ref<HTMLImageElement | null>(null);

// The handle is the bitmap's identity; the reports go to the view that planned it.
watch(
  [image, () => props.source.handle],
  ([element, handle], _previous, onCleanup) => {
    if (!element) return;
    const { view, page, source } = props;
    onCleanup(
      bindPaintedImage(element, handle, {
        onPainted: () => view.markPainted(page, source.key),
        onUnpainted: () => view.markUnpainted(page, source.key),
      }),
    );
  },
  { immediate: true, flush: 'post' },
);

/** A raster whose size disagrees with its rect would be stretched into place: a stale picture. */
function checkSize(event: Event) {
  const naturalWidth = (event.currentTarget as HTMLImageElement).naturalWidth;
  if (naturalWidth <= 0) return;
  const expected = Math.round(props.source.rect.width * props.source.scale);
  if (Math.abs(naturalWidth - expected) > 1) {
    devWarn(
      'tile-size',
      `tile bitmap ${naturalWidth}px wide does not match its rect ` +
        `(expected ~${expected}px) — stale raster identity? key=${props.source.key}`,
    );
  }
}

const style = computed((): CSSProperties => {
  const { rect, z } = props.source;
  const scale = props.viewScale;
  return {
    position: 'absolute',
    left: `${rect.x * scale}px`,
    top: `${rect.y * scale}px`,
    width: `${rect.width * scale}px`,
    height: `${rect.height * scale}px`,
    zIndex: z,
    animation: props.fadeMs > 0 ? `epdf-tile-in ${props.fadeMs}ms ease-out` : undefined,
  };
});
</script>

<template>
  <img ref="image" alt="" draggable="false" :style="style" @load="checkSize" />
</template>
