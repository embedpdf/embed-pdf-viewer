<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';
import { toast } from './toast'; // your own

useAnnotationEvent(
  (annotation) => annotation.onUpdated,
  ({ annotation, origin }) => {
    if (origin.kind === 'remote') toast(`${annotation.author} changed a comment`);
  },
);
</script>

<template>
  <slot />
</template>
