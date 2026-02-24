<template>
  <div
    v-if="rect"
    :style="{
      position: 'absolute',
      pointerEvents: 'none',
      left: `${rect.origin.x * actualScale}px`,
      top: `${rect.origin.y * actualScale}px`,
      width: `${rect.size.width * actualScale}px`,
      height: `${rect.size.height * actualScale}px`,
      border: `1px solid ${stroke}`,
      background: fill,
      boxSizing: 'border-box',
    }"
    :class="className"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Rect } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/vue';
import { useZoomCapability } from '../hooks';

interface MarqueeZoomProps {
  /** The ID of the document */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Scale of the page */
  scale?: number;
  /** Optional CSS class applied to the marquee rectangle */
  className?: string;
  /** Stroke / fill colours (defaults below) */
  stroke?: string;
  fill?: string;
}

const props = withDefaults(defineProps<MarqueeZoomProps>(), {
  stroke: 'rgba(33,150,243,0.8)',
  fill: 'rgba(33,150,243,0.15)',
});

const { provides: zoomPlugin } = useZoomCapability();
const documentState = useDocumentState(() => props.documentId);
const rect = ref<Rect | null>(null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [zoomPlugin, () => props.documentId, () => props.pageIndex, actualScale],
  ([plugin, docId, pageIdx, scale], _, onCleanup) => {
    if (!plugin) {
      rect.value = null;
      return;
    }

    const unregister = plugin.registerMarqueeOnPage({
      documentId: docId,
      pageIndex: pageIdx,
      scale,
      callback: {
        onPreview: (newRect) => {
          rect.value = newRect;
        },
      },
    });

    onCleanup(() => {
      unregister?.();
    });
  },
  { immediate: true },
);
</script>
