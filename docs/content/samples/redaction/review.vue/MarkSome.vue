<!-- On load: the cover's subtitle, and every "Adobe" in the document. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useAnnotationState } from '@embedpdf/vue/annotation';
import { useRedaction } from '@embedpdf/vue/redaction';

const redaction = useRedaction();
const ready = useAnnotationState((state) => state.status === 'ready');

let started = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || started) return;
    started = true;
    void redaction
      .markArea(0, { x: 44, y: 318, width: 206, height: 50 })
      .then(() => redaction.markMatches({ text: 'Adobe' }));
  },
  { immediate: true },
);
</script>

<template></template>
