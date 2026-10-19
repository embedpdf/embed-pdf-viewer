<!-- On load: two notes on the cover, one already accepted. -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState, useComments } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const comments = useComments();
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
    void annotation
      .create(page, {
        subtype: 'text',
        rect: { x: 280, y: 520, width: 20, height: 20 },
        contents: 'Add the co-author',
        color: '#facc15',
      })
      .then(({ annotation: note }) => comments.setStatus(note.ref, 'accepted'));
  },
  { immediate: true },
);
</script>

<template></template>
