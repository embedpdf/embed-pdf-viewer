<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a highlight, a rectangle, a sticky note and a text box on the cover.
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
      subtype: 'highlight',
      quadPoints: [
        {
          upperLeft: { x: 106, y: 218 },
          upperRight: { x: 458, y: 218 },
          lowerLeft: { x: 106, y: 267 },
          lowerRight: { x: 458, y: 267 },
        },
      ],
      color: '#ffcd45',
    });
    void annotation.create(page, {
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#e5484d',
      strokeWidth: 3,
    });
    void annotation.create(page, {
      subtype: 'text',
      rect: { x: 470, y: 232, width: 20, height: 20 },
      contents: 'A good title',
      color: '#facc15',
    });
    void annotation.create(page, {
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Double-click to type here',
      fontSize: 16,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
    });
  },
  { immediate: true },
);
</script>

<template></template>
