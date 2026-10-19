<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a rectangle and a text box on the cover, the text box selected so the menu shows.
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
        subtype: 'free-text',
        box: { x: 300, y: 512, width: 230, height: 40 },
        contents: 'Ready for review',
        fontSize: 16,
        fontColor: '#1a2748',
        interiorColor: '#fffbe6',
      },
      undefined,
      { select: true },
    );
  },
  { immediate: true },
);
</script>

<template></template>
