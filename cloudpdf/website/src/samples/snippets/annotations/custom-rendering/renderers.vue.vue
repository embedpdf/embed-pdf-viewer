<script setup lang="ts">
import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/vue/annotation';
import ApprovedBadge from './ApprovedBadge.vue';

const renderers: AnnotationRenderer[] = [
  {
    for: (annotation) => annotation.subtype === 'stamp' && annotation.name === 'Approved',
    component: ApprovedBadge,
  },
];
</script>

<template>
  <AnnotationLayer :renderers />
</template>
