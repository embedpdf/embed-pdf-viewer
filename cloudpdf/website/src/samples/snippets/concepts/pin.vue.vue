<script setup lang="ts">
import { computed } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/vue/annotation';

const props = defineProps<AnnotationRendererProps>();

// page coordinates → pixels on this page, at its zoom; the page turns them with it
const point = computed(() => props.page.transform.toPixels({ x: props.box.x, y: props.box.y }));
</script>

<template>
  <div :style="{ position: 'absolute', left: `${point.x}px`, top: `${point.y}px` }">📌</div>
</template>
