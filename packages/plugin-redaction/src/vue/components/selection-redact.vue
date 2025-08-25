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
      border="1px solid red"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { Rect } from '@embedpdf/models';
import { useRedactionCapability } from '../hooks/use-redaction';
import Highlight from './highlight.vue';

interface SelectionRedactProps {
  pageIndex: number;
  scale: number;
}

const props = defineProps<SelectionRedactProps>();

const { provides: redactionProvides } = useRedactionCapability();
const rects = ref<Rect[]>([]);
const boundingRect = ref<Rect | null>(null);

let unsubscribe: (() => void) | undefined;

onMounted(() => {
  if (!redactionProvides.value) return;

  unsubscribe = redactionProvides.value.onRedactionSelectionChange((formattedSelection) => {
    const selection = formattedSelection.find((s) => s.pageIndex === props.pageIndex);
    rects.value = selection?.segmentRects ?? [];
    boundingRect.value = selection?.rect ?? null;
  });
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>
