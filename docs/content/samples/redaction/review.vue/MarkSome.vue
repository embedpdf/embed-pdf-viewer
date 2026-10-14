<!-- On load: the author's name, and every "commercial" in the document. -->
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
      .markArea(0, { x: 100, y: 508, width: 172, height: 50 })
      .then(() => redaction.markMatches({ text: 'commercial' }));
  },
  { immediate: true },
);
</script>

<template></template>
