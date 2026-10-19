<!-- On load: three filled rectangles stacked on the cover, the middle one selected. -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const COLORS = [
  { color: '#e5484d', fill: '#ffd1d3' },
  { color: '#30a46c', fill: '#c9f0da' },
  { color: '#1e90ff', fill: '#cfe6ff' },
];

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
    COLORS.forEach(({ color, fill }, index) => {
      void annotation.create(
        page,
        {
          subtype: 'square',
          box: { x: 300 + index * 50, y: 520 + index * 30, width: 160, height: 90 },
          color,
          interiorColor: fill,
          strokeWidth: 3,
        },
        undefined,
        { select: index === 1 },
      );
    });
  },
  { immediate: true },
);
</script>

<template></template>
