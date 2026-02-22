<template>
  <div
    v-if="boundingRect"
    :style="{
      mixBlendMode: 'normal',
      pointerEvents: 'none',
      position: 'absolute',
      inset: 0,
    }"
  >
    <Highlight
      :color="'transparent'"
      :opacity="1"
      :rects="rects"
      :scale="scale"
      :border="`1px solid ${strokeColor}`"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Rect } from '@embedpdf/models';
import { useRedactionPlugin } from '../hooks/use-redaction';
import Highlight from './highlight.vue';

interface SelectionRedactProps {
  documentId: string;
  pageIndex: number;
  scale: number;
}

const props = defineProps<SelectionRedactProps>();

const { plugin: redactionPlugin } = useRedactionPlugin();
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);

// Get stroke color from plugin (annotation mode uses tool defaults, legacy uses red)
const strokeColor = computed(() => redactionPlugin.value?.getPreviewStrokeColor() ?? 'red');

watch(
  [redactionPlugin, () => props.documentId, () => props.pageIndex],
  ([plugin, docId, pageIdx], _, onCleanup) => {
    if (!plugin) {
      rects.value = [];
      boundingRect.value = null;
      return;
    }

    const unsubscribe = plugin.onRedactionSelectionChange(docId, (formattedSelection) => {
      const selection = formattedSelection.find((s) => s.pageIndex === pageIdx);
      rects.value = selection?.segmentRects ?? [];
      boundingRect.value = selection?.rect ?? null;
    });

    onCleanup(unsubscribe);
  },
  { immediate: true },
);
</script>
