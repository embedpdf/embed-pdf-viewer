<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: two shapes at the top of the cover, two at the bottom, and all four selected.
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
    void Promise.all([
      annotation.create(page, {
        subtype: 'square',
        box: { x: 60, y: 40, width: 120, height: 50 },
        color: '#e5484d',
        strokeWidth: 3,
      }),
      annotation.create(page, {
        subtype: 'circle',
        box: { x: 490, y: 200, width: 80, height: 80 },
        color: '#1e90ff',
        strokeWidth: 3,
      }),
      annotation.create(page, {
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#30a46c',
        strokeWidth: 3,
      }),
      annotation.create(page, {
        subtype: 'text',
        rect: { x: 480, y: 640, width: 20, height: 20 },
        contents: 'A note at the bottom',
        color: '#facc15',
      }),
    ]).then(() => annotation.selection.selectAll(page));
  },
  { immediate: true },
);
</script>

<template></template>
