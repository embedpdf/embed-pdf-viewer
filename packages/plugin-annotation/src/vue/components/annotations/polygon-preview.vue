<script setup lang="ts">
import { Rect } from '@embedpdf/models';
import { PolygonPreviewData } from '@embedpdf/plugin-annotation';
import Polygon from './polygon.vue';

defineProps<{
  data: PolygonPreviewData;
  bounds: Rect;
  scale: number;
}>();
</script>

<template>
  <Polygon :isSelected="false" :scale="scale" v-bind="data" />
</template>
