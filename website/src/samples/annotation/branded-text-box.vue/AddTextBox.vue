<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a text box on the cover, selected.
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
    void annotation.create(
      page,
      {
        subtype: 'free-text',
        box: { x: 106, y: 570, width: 380, height: 60 },
        contents: 'Double-click to type in your own text box',
        fontSize: 16,
        fontColor: '#1a2748',
      },
      undefined,
      { select: true },
    );
  },
  { immediate: true },
);
</script>

<template></template>
