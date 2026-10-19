<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: two notes on the cover, 24 points square: 32 pixels at 100%.
const annotation = useAnnotation();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
let added = false;

watch(
  [ready, cover],
  ([isReady, page]) => {
    if (!isReady || !page || added) return;
    added = true;
    void annotation.create(page, {
      subtype: 'text',
      rect: { x: 470, y: 228, width: 24, height: 24 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation.create(page, {
      subtype: 'text',
      rect: { x: 280, y: 516, width: 24, height: 24 },
      contents: 'Add the co-author',
      color: '#facc15',
    });
  },
  { immediate: true },
);
</script>

<template></template>
