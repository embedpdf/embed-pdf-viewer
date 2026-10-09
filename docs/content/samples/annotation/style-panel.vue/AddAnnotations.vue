<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a rectangle (selected), an arrow and a text box on the cover.
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
      subtype: 'line',
      linePoints: { start: { x: 520, y: 120 }, end: { x: 470, y: 230 } },
      lineEndings: { start: 'none', end: 'closed-arrow' },
      color: '#1a2748',
      strokeWidth: 3,
    });
    void annotation.create(page, {
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Ready for review',
      fontSize: 16,
      fontColor: '#1a2748',
    });
    void annotation.create(
      page,
      {
        subtype: 'square',
        box: { x: 96, y: 506, width: 178, height: 54 },
        color: '#e5484d',
        interiorColor: '#ffe4e1',
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
