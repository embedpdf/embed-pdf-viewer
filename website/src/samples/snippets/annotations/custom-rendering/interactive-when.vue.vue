<script setup lang="ts">
import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/vue/annotation';
import ApprovalWidget from './ApprovalWidget.vue';

const renderers: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovalWidget,
    interactive: ({ toolId }) => toolId === 'pan', // interactive in reading mode only
  },
];
</script>

<template>
  <AnnotationLayer :renderers />
</template>
