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
      border: `1px dashed ${stroke}`,
      background: fill,
      boxSizing: 'border-box',
      zIndex: 1000,
    }"
    :class="className"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Rect } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/vue';
import { useSelectionPlugin } from '../hooks';

interface MarqueeSelectionProps {
  /** The ID of the document */
  documentId: string;
  /** Index of the page this layer lives on */
  pageIndex: number;
  /** Scale of the page (optional, defaults to document scale) */
  scale?: number;
  /** Optional CSS class applied to the marquee rectangle */
  className?: string;
  /** Stroke colour (default: 'rgba(0,122,204,0.8)') */
  stroke?: string;
  /** Fill colour (default: 'rgba(0,122,204,0.15)') */
  fill?: string;
}

const props = withDefaults(defineProps<MarqueeSelectionProps>(), {
  stroke: 'rgba(0,122,204,0.8)',
  fill: 'rgba(0,122,204,0.15)',
});

const { plugin: selPlugin } = useSelectionPlugin();
const documentState = useDocumentState(() => props.documentId);
const rect = ref<Rect | null>(null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

watch(
  [selPlugin, () => props.documentId, () => props.pageIndex, actualScale],
  ([plugin, docId, pageIdx, scale], _, onCleanup) => {
    rect.value = null;

    if (!plugin) {
      return;
    }

    const unregister = plugin.registerMarqueeOnPage({
      documentId: docId,
      pageIndex: pageIdx,
      scale,
      onRectChange: (newRect) => {
        rect.value = newRect;
      },
    });

    onCleanup(() => {
      unregister?.();
    });
  },
  { immediate: true },
);
</script>
