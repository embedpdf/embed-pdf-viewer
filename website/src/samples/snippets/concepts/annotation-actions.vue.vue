<script setup lang="ts">
import { useAnnotation, type AnnotationRef } from '@embedpdf/vue/annotation';
import DrawingTools from './DrawingTools.vue';

defineProps<{ annotationRef: AnnotationRef }>();

const annotation = useAnnotation();
</script>

<template>
  <DrawingTools v-if="annotation.canCreate()" />
  <button :disabled="!annotation.canDelete(annotationRef)">Delete</button>
</template>
