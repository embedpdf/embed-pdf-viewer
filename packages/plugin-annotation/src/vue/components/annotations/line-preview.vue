<script setup lang="ts">
import { Rect } from '@embedpdf/models';
import { LinePreviewData } from '@embedpdf/plugin-annotation';
import Line from './line.vue';

defineProps<{
  data: LinePreviewData;
  bounds: Rect;
  scale: number;
}>();
</script>

<template>
  <Line :isSelected="false" :scale="scale" v-bind="data" />
</template>
