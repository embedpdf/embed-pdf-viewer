<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

useAnnotationEvent(
  (annotation) => annotation.onCreated,
  ({ annotation, origin }) => {
    console.log(`${annotation.author} added a ${annotation.subtype}`);
  },
);
</script>

<template>
  <slot />
</template>
