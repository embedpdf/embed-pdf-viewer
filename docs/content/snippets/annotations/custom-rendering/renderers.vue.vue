<script setup lang="ts">
import { AnnotationLayer, type AnnotationRenderer } from '@embedpdf/vue/annotation';
import CommentBubble from './CommentBubble.vue';

const renderers: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'text', component: CommentBubble },
];
</script>

<template>
  <AnnotationLayer :renderers />
</template>
