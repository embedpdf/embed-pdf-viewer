<script setup lang="ts">
import { computed } from 'vue';
import type { Rect } from '@embedpdf/models';
import type { StampPreviewData } from '@embedpdf/plugin-annotation';

const props = defineProps<{
  data: StampPreviewData;
  bounds: Rect;
  scale: number;
}>();

const rotationDeg = computed(() => ((4 - props.data.pageRotation) % 4) * 90);

const style = computed(() => ({
  width: '100%',
  height: '100%',
  opacity: 0.6,
  objectFit: 'contain' as const,
  pointerEvents: 'none' as const,
  transform: rotationDeg.value ? `rotate(${rotationDeg.value}deg)` : undefined,
}));
</script>

<template>
  <img :src="data.ghostUrl" :style="style" alt="" />
</template>
