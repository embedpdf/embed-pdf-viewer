<script setup lang="ts">
import { computed } from 'vue';
import type { Rect } from '@embedpdf/models';
import type { WidgetPreviewData } from '../types';

const props = defineProps<{
  data: WidgetPreviewData;
  bounds: Rect;
  scale: number;
}>();

const style = computed(() => ({
  position: 'absolute' as const,
  left: 0,
  top: 0,
  width: `${props.bounds.size.width * props.scale}px`,
  height: `${props.bounds.size.height * props.scale}px`,
  border: '1px dashed rgba(66, 133, 244, 0.6)',
  backgroundColor: 'rgba(255, 255, 255, 0.9)',
  boxSizing: 'border-box' as const,
  display: 'flex',
  alignItems: 'center',
  padding: `0 ${2 * props.scale}px`,
  overflow: 'hidden',
}));
</script>

<template>
  <div :style="style" />
</template>
