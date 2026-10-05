<!--
  <RenderLayer>: the page's picture, in two planes. The base plane is a
  whole-page <img> at the plugin's resolved size, always there, the instant
  backdrop. The tile plane above it paints the plugin's tile plan when the view
  wants more pixels than the base may spend; a thumbnail-sized view engages
  none. The layer only paints: every decision (sizes, tiles, caching, release)
  is the render plugin's, and anything mid-gesture scales with CSS until the
  plugin hands down new pixels.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { RenderToken } from '@embedpdf/plugin-render/contract/host';
import type { PaintSettings } from '@embedpdf/plugin-render/contract/host';
import { usePageLayerFact } from '../dev-registry';
import { useOptionalCapability, useOptionalSelector } from '../runtime/capabilities';
import { usePage } from '../runtime/page';
import TilePlane from './TilePlane.vue';

const props = withDefaults(
  defineProps<{
    /**
     * Bake annotations into the page picture. Pass `false` when an
     * `<AnnotationLayer>` draws them, so they aren't drawn twice.
     */
    annotations?: boolean;
    /**
     * Mount the tile plane. Whether it spends anything is the plugin's
     * arithmetic: leave it on, and pass `false` only for a view that must never
     * tile, even at deep zoom.
     */
    tiles?: boolean;
  }>(),
  { annotations: true, tiles: true },
);

const page = usePage();
// The layer is a host of the render plugin: it paints conformed sources. The
// host lens is the same runtime token, typed wider.
const render = useOptionalCapability(RenderToken);
const NO_PAINT: PaintSettings = { fadeMs: 0, tiles: false };
// The same object until a setting it reads changes.
const settings = useOptionalSelector(RenderToken, (lens) => lens.getPaintSettings(), NO_PAINT);
usePageLayerFact(page, 'renderBakesAnnotations', () => props.annotations);

// The raster's identity: its conformed width, the annotations flag and the
// page's epoch. Above the budget it stays put while zooming, so the deep-zoom
// backdrop never fetches again.
const sourceKey = useOptionalSelector(
  RenderToken,
  (lens) =>
    lens.getSourceKey(page.value.ref, {
      scale: page.value.transform.renderScale,
      includeAnnotations: props.annotations,
    }),
  null,
);

const image = ref<HTMLImageElement | null>(null);
watch(
  [render, () => page.value.ref, sourceKey],
  ([lens, pageRef], _previous, onCleanup) => {
    if (!lens) return;
    const controller = new AbortController();
    let revoke: (() => void) | undefined;
    onCleanup(() => {
      controller.abort();
      revoke?.();
    });
    void (async () => {
      try {
        // The plugin conforms this to its resolved size and collapses asks for
        // the same key, so any scale that maps to this key asks for this key.
        const picture = await lens.renderSource(pageRef, {
          scale: page.value.transform.renderScale,
          includeAnnotations: props.annotations,
          view: page.value.view,
          signal: controller.signal,
        });
        const object = await picture.objectUrl().abortWith(controller.signal);
        if (controller.signal.aborted) {
          object.revoke();
          return;
        }
        revoke = object.revoke;
        // Set on a lasting element: the browser keeps the old picture until the
        // new one decodes, and never asks for the old URL again, so revoking it
        // on cleanup is safe.
        if (image.value) image.value.src = object.url;
      } catch {
        // Aborted (the view moved, or the layer unmounted), or the render failed.
      }
    })();
  },
  { immediate: true, flush: 'post' },
);
</script>

<template>
  <img
    ref="image"
    alt=""
    draggable="false"
    :style="{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    }"
  />
  <TilePlane v-if="tiles && settings.tiles" :annotations="annotations" :fade-ms="settings.fadeMs" />
</template>
