<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: two notes and a rectangle on the cover, each with a comment.
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
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'Can we shorten the title?',
      color: '#facc15',
    });
    void annotation.create(page, {
      subtype: 'text',
      rect: { x: 280, y: 520, width: 20, height: 20 },
      contents: 'Add the co-author',
      color: '#facc15',
    });
    void annotation.create(page, {
      subtype: 'square',
      box: { x: 96, y: 376, width: 360, height: 118 },
      contents: 'This subtitle reads well',
      color: '#30a46c',
      strokeWidth: 3,
    });
  },
  { immediate: true },
);
</script>

<template></template>
