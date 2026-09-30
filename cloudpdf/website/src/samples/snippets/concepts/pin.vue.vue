<script setup lang="ts">
import { computed } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

const props = defineProps<AnnotationRendererProps>();

// page coordinates → this page's pixels, zoom and rotation included
const point = computed(() => props.page.transform.pageToView({ x: props.box.x, y: props.box.y }));
</script>

<template>
  <div :style="{ position: 'absolute', left: `${point.x}px`, top: `${point.y}px` }">📌</div>
</template>
