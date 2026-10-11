<!--
  The layer's own drawing of one annotation, inside its frame: the engine's
  raster where the core places it (following a move as it happens), or the
  vector scene for everything drawn live (shapes, clouds, markup, a drawing
  in progress, a tool's ghost, a picture older than the annotation). One rule
  picks (`pictureOrPainting`). A renderer gets it as `native`.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { CSSProperties } from 'vue';
import { drawsLive, type RenderItem } from '@embedpdf/core-annotation';
import {
  pictureOrPainting,
  rasterInFrame,
  shownAppearance,
  type AppearanceUrl,
} from '@embedpdf/web';
import AnnotationScene from './AnnotationScene.vue';

const props = defineProps<{
  item: RenderItem;
  /** The page's loaded pictures, by item and state; `null` until the first ones arrive. */
  urls: Readonly<Record<string, AppearanceUrl>> | null;
}>();

const shows = computed(() => {
  const { item, urls } = props;
  return pictureOrPainting({
    pending: item.source !== 'baked',
    picture: urls && shownAppearance(urls, item.id, item.annotation?.appearanceState ?? null),
    version: item.pictureVersion ?? 0,
    loaded: urls !== null,
    paint: () =>
      item.source !== 'baked' || (item.annotation && drawsLive(item.annotation)) ? item : null,
  });
});

/** The engine's raster inside the item's frame, where `item.raster` puts it, at any frame size. */
const baked = computed((): { url: string; style: CSSProperties } | null => {
  const { item } = props;
  const look = shows.value;
  if (look?.kind !== 'picture' || !item.raster) return null;
  const box = rasterInFrame(item.raster, item.frame);
  return {
    url: look.picture.url,
    style: {
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
    },
  };
});
</script>

<template>
  <img v-if="baked" :src="baked.url" alt="" draggable="false" :style="baked.style" />
  <AnnotationScene v-else-if="shows?.kind === 'painting'" :item="item" />
</template>
