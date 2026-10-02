<!--
  The layer's own drawing of one annotation, inside its frame: the engine's
  raster where the core places it (following a move as it happens), or the
  vector scene for everything drawn live (shapes, clouds, markup, a drawing
  in progress, a tool's ghost). A renderer gets it as `native`.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import type { RenderItem } from '@embedpdf/core-annotation';
import { rasterInFrame } from '@embedpdf/web';
import AnnotationScene from './AnnotationScene.vue';

const props = defineProps<{
  item: RenderItem;
  /** The baked appearance's object URL, once it's loaded. */
  url: string | null;
}>();

/** The engine's raster inside the item's frame, where `item.raster` puts it, at any frame size. */
const baked = computed((): CSSProperties | null => {
  const { item, url } = props;
  if (item.source !== 'baked' || !url || !item.raster) return null;
  const box = rasterInFrame(item.raster, item.frame);
  return {
    position: 'absolute',
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    // The appearance box is sized in content units; a global
    // `img { max-width: 100% }` reset would otherwise clamp it to the
    // containing block and distort the aspect (a landscape stamp on a turned,
    // portrait page), so honour the explicit size.
    maxWidth: 'none',
    maxHeight: 'none',
    pointerEvents: 'none',
    // The turn the engine took out of the raster, put back about its middle.
    transform: box.transform,
    transformOrigin: 'center',
  };
});
</script>

<template>
  <img v-if="baked" :src="url ?? undefined" alt="" draggable="false" :style="baked" />
  <AnnotationScene v-else-if="item.source !== 'baked'" :item="item" />
</template>
