<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useInteraction } from '@embedpdf/vue/interaction';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: a text file pinned to the cover, and the stamp tool active.
const annotation = useAnnotation();
const interaction = useInteraction();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);
let added = false;

watch(
  [ready, cover],
  ([isReady, page]) => {
    if (!isReady || !page || added) return;
    added = true;
    const notes = new File(['Questions for the next review.'], 'notes.txt', { type: 'text/plain' });
    void annotation.create(
      page,
      { subtype: 'file-attachment', rect: { x: 470, y: 232, width: 20, height: 20 } },
      { file: notes },
    );
    interaction.activateTool('stamp');
  },
  { immediate: true },
);
</script>

<template></template>
