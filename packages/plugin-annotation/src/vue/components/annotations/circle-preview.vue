<script setup lang="ts">
import { Rect } from '@embedpdf/models';
import { CirclePreviewData } from '@embedpdf/plugin-annotation';
import Circle from './circle.vue';

defineProps<{
  data: CirclePreviewData;
  bounds: Rect;
  scale: number;
}>();
</script>

<template>
  <Circle :isSelected="false" :scale="scale" v-bind="data" />
</template>
