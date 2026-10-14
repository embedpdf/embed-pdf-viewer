<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a text box born with formatting, selected. Runs change the body only where they differ.
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
        interiorColor: '#fffbe6',
        richText: {
          body: { family: 'Helvetica', size: 16, color: '#1a2748' },
          paragraphs: [
            {
              runs: [
                { text: 'Double-click me, select a word, then make it ' },
                { text: 'bold', style: { weight: 700 } },
                { text: ' or ' },
                { text: 'red', style: { color: '#c00000' } },
                { text: '.' },
              ],
            },
          ],
        },
      },
      undefined,
      { select: true },
    );
  },
  { immediate: true },
);
</script>

<template></template>
