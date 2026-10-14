<script setup lang="ts">
import { useAnnotationEvent } from '@embedpdf/vue/annotation';

// Every change is kept for next time.
useAnnotationEvent(
  (annotation) => annotation.tools.onDefaultsChanged,
  ({ toolId, defaults }) => {
    localStorage.setItem(`tool:${toolId}`, JSON.stringify(defaults));
  },
);
</script>

<template></template>
