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
      border: `1px ${resolvedBorderStyle} ${resolvedBorderColor}`,
      background: resolvedBackground,
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
  /** Fill/background color inside the marquee rectangle. Default: 'rgba(0,122,204,0.15)' */
  background?: string;
  /** Border color of the marquee rectangle. Default: 'rgba(0,122,204,0.8)' */
  borderColor?: string;
  /** Border style. Default: 'dashed' */
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  /**
   * @deprecated Use `borderColor` instead.
   */
  stroke?: string;
  /**
   * @deprecated Use `background` instead.
   */
  fill?: string;
}

const props = withDefaults(defineProps<MarqueeSelectionProps>(), {
  borderStyle: 'dashed',
});

// Resolve deprecated props: new CSS-standard props take precedence
const resolvedBorderColor = computed(
  () => props.borderColor ?? props.stroke ?? 'rgba(0,122,204,0.8)',
);
const resolvedBackground = computed(() => props.background ?? props.fill ?? 'rgba(0,122,204,0.15)');
const resolvedBorderStyle = computed(() => props.borderStyle);

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
