<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: two rectangles on the cover, the right one selected. Drag it next to the other.
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
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#1e90ff',
      strokeWidth: 3,
    });
    void annotation.create(
      page,
      {
        subtype: 'square',
        box: { x: 340, y: 560, width: 120, height: 80 },
        color: '#e5484d',
        strokeWidth: 3,
      },
      undefined,
      { select: true },
    );
  },
  { immediate: true },
);
</script>

<template></template>
