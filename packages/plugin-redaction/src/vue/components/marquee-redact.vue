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
      border: `1px solid ${strokeColor}`,
      background: fill,
      boxSizing: 'border-box',
    }"
    :class="className"
  />
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import type { Rect } from '@embedpdf/models';
import { useRedactionPlugin } from '../hooks/use-redaction';

interface MarqueeRedactProps {
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

const props = withDefaults(defineProps<MarqueeRedactProps>(), {
  stroke: 'red',
  fill: 'transparent',
});

const { plugin: redactionPlugin } = useRedactionPlugin();
const documentState = useDocumentState(() => props.documentId);
const rect = ref<Rect | null>(null);

const actualScale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

// Get stroke color from plugin (annotation mode uses tool defaults, legacy uses red)
// Allow prop override for backwards compatibility
const strokeColor = computed(
  () => props.stroke ?? redactionPlugin.value?.getPreviewStrokeColor() ?? 'red',
);

watch(
  [redactionPlugin, () => props.documentId, () => props.pageIndex],
  ([plugin, docId, pageIdx], _, onCleanup) => {
    if (!plugin || !docId) return;

    const unsubscribe = plugin.onRedactionMarqueeChange(docId, (data) => {
      rect.value = data.pageIndex === pageIdx ? data.rect : null;
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);
</script>
