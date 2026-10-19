<script setup lang="ts">
import { annotationKey, useAnnotationEvent } from '@embedpdf/vue/annotation';
import { api } from './api'; // your own

useAnnotationEvent(
  (annotation) => annotation.onCreated,
  ({ annotation, origin }) => {
    if (origin.kind === 'local')
      api.put(`/annotations/${annotationKey(annotation.ref)}`, annotation);
  },
);
</script>

<template>
  <slot />
</template>
