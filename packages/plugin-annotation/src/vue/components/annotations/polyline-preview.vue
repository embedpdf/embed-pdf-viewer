<script setup lang="ts">
import { Rect } from '@embedpdf/models';
import { PolylinePreviewData } from '@embedpdf/plugin-annotation';
import Polyline from './polyline.vue';

defineProps<{
  data: PolylinePreviewData;
  bounds: Rect;
  scale: number;
}>();
</script>

<template>
  <Polyline :isSelected="false" :scale="scale" v-bind="data" />
</template>
