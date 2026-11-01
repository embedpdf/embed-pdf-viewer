<!--
  The page's box, lent to the plugin that paints its picture: it paints into it
  once, follows the page as it changes, and takes the picture away when the page
  goes or the painter is given back.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { PaintedPicture, PicturePainter } from '@embedpdf/plugin-render';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import { useOptionalCapability } from '../runtime/capabilities';
import { usePage } from '../runtime/page';

const props = defineProps<{ painter: PicturePainter<HTMLElement> }>();
const page = usePage();
const render = useOptionalCapability(RenderToken);
const host = ref<HTMLDivElement | null>(null);
let painted: { picture: PaintedPicture; page: typeof page.value } | null = null;

// Another painter or another page paints anew; a new page context is an update of the same picture.
watch(
  [render, () => props.painter, () => page.value.ref, host],
  ([lens, painter, , element], _previous, onCleanup) => {
    if (!lens || !element) return;
    // The page is loading until the painter reports its picture on screen.
    const report = lens.reportPicture(page.value.view, page.value.ref);
    const entry = { picture: painter.paint(element, page.value, report), page: page.value };
    painted = entry;
    onCleanup(() => {
      entry.picture.destroy();
      if (painted === entry) painted = null;
      report.close();
    });
  },
  { flush: 'post' },
);
watch(
  page,
  (current) => {
    if (!painted || painted.page === current) return;
    painted.page = current;
    painted.picture.update(current);
  },
  { flush: 'post' },
);
</script>

<template>
  <div
    ref="host"
    :style="{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    }"
  />
</template>
