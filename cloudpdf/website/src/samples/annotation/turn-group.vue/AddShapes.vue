<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a rectangle and a circle on the cover, both selected.
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
        box: { x: 300, y: 560, width: 140, height: 60 },
        color: '#e5484d',
        interiorColor: '#ffe4e1',
        strokeWidth: 3,
      }),
      annotation.create(page, {
        subtype: 'circle',
        box: { x: 460, y: 550, width: 80, height: 80 },
        color: '#1e90ff',
        strokeWidth: 3,
      }),
    ]).then((created) => annotation.selection.set(created.map((c) => c.annotation.ref)));
  },
  { immediate: true },
);
</script>

<template></template>
