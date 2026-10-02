<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useInteraction } from '@embedpdf/vue/interaction';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the pen is active, with a stroke drawn in its current style.
const annotation = useAnnotation();
const interaction = useInteraction();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
let added = false;

watch(
  [ready, cover],
  ([isReady, page]) => {
    if (!isReady || !page || added) return;
    added = true;
    const wave = Array.from({ length: 24 }, (_, i) => ({
      x: 300 + i * 10,
      y: 540 + Math.sin(i / 2) * 14,
    }));
    void annotation.create(page, { subtype: 'ink', inkList: [wave] }, undefined, { tool: 'ink' });
    interaction.activateTool('ink');
  },
  { immediate: true },
);
</script>

<template></template>
