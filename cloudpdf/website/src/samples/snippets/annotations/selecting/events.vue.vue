<script setup lang="ts">
import { ref } from 'vue';
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

const sidebarOpen = ref(false);

useAnnotationEvent(
  (annotation) => annotation.onSelectionChanged,
  ({ refs }) => (sidebarOpen.value = refs.length > 0),
);
</script>

<template>
  <aside v-if="sidebarOpen"><!-- … --></aside>
</template>
