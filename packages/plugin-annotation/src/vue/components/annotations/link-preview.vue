<script setup lang="ts">
import { computed } from 'vue';
import { Rect } from '@embedpdf/models';
import { LinkPreviewData } from '@embedpdf/plugin-annotation';

const props = defineProps<{
  data: LinkPreviewData;
  bounds: Rect;
  scale: number;
}>();

const style = computed(() => ({
  position: 'absolute' as const,
  left: 0,
  top: 0,
  width: `${props.bounds.size.width * props.scale}px`,
  height: `${props.bounds.size.height * props.scale}px`,
  borderBottom: `${props.data.strokeWidth * props.scale}px solid ${props.data.strokeColor}`,
  backgroundColor: 'rgba(0, 0, 255, 0.05)',
  boxSizing: 'border-box' as const,
}));
</script>

<template>
  <div :style="style" />
</template>
