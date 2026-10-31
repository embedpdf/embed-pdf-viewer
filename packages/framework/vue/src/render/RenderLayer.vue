<!--
  <RenderLayer>: the page's picture. The render plugin draws it (RasterLayer),
  unless another plugin paints this view's pictures (`handOverPictures`): then
  the layer lends that plugin its box (PainterBox).
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { PicturePainter } from '@embedpdf/plugin-render';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import { useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import PainterBox from './PainterBox.vue';
import RasterLayer from './RasterLayer.vue';

const props = withDefaults(
  defineProps<{
    /**
     * Draw the annotations into the page's picture (`true`) or leave them out
     * (`false`). Left unset, the picture leaves them to an `<AnnotationLayer>`
     * on the page, and otherwise draws them when the user may read them.
     */
    annotations?: boolean;
    /** The same for the form fields, which a `<FormLayer>` paints. */
    formFields?: boolean;
    /**
     * Mount the tile plane. Whether it spends anything is the plugin's
     * arithmetic: leave it on, and pass `false` only for a view that must never
     * tile, even at deep zoom.
     */
    tiles?: boolean;
    /**
     * Draw the page's thumbnail instead: one small picture of the whole page,
     * without tiles, which needs only `doc.render.thumbnail` (a strip of
     * thumbnails, a page picker).
     */
    thumbnail?: boolean;
  }>(),
  // Unset stays unset: a boolean prop would otherwise read `false`.
  { annotations: undefined, formFields: undefined, tiles: true, thumbnail: false },
);

const page = usePage();
const painter = useOptionalSelector(RenderToken, (lens) => lens.getPicturePainter(), null);
/** The plugin that paints this view's pictures, or `null` while the render plugin does. */
const painting = computed(() =>
  painter.value?.paints(page.value.view) ? (painter.value as PicturePainter<HTMLElement>) : null,
);
</script>

<template>
  <PainterBox v-if="painting" :painter="painting" />
  <RasterLayer v-else v-bind="props" />
</template>
