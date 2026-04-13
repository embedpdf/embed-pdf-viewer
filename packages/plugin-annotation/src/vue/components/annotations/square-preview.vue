<script setup lang="ts">
import { Rect } from '@embedpdf/models';
import { SquarePreviewData } from '@embedpdf/plugin-annotation';
import Square from './square.vue';

defineProps<{
  data: SquarePreviewData;
  bounds: Rect;
  scale: number;
}>();
</script>

<template>
  <Square :isSelected="false" :scale="scale" v-bind="data" />
</template>
