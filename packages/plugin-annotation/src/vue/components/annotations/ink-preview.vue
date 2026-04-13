<script setup lang="ts">
import { Rect } from '@embedpdf/models';
import { InkPreviewData } from '@embedpdf/plugin-annotation';
import Ink from './ink.vue';

defineProps<{
  data: InkPreviewData;
  bounds: Rect;
  scale: number;
}>();
</script>

<template>
  <Ink :isSelected="false" :scale="scale" v-bind="data" />
</template>
