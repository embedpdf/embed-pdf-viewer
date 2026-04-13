<script setup lang="ts">
import { computed } from 'vue';
import { Rect } from '@embedpdf/models';
import { FreeTextPreviewData } from '@embedpdf/plugin-annotation';

const props = defineProps<{
  data: FreeTextPreviewData;
  bounds: Rect;
  scale: number;
}>();

const style = computed(() => ({
  width: '100%',
  height: '100%',
  border: `1px dashed ${props.data.fontColor || '#000000'}`,
  backgroundColor: 'transparent',
}));
</script>

<template>
  <div :style="style" />
</template>
