<!-- On load: a note with two replies on the cover, and a highlight with a comment on page 2. -->
<script setup lang="ts">
import { watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState, useComments } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const comments = useComments();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();

let added = false;
watch(
  [ready, pages],
  ([isReady, [cover, second]]) => {
    if (!isReady || !cover || !second || added) return;
    added = true;
    void annotation
      .create(cover.ref, {
        subtype: 'text',
        rect: { x: 470, y: 232, width: 20, height: 20 },
        contents: 'Can we shorten the title?',
        color: '#facc15',
      })
      .then(async ({ annotation: note }) => {
        await comments.reply(note.ref, 'Maybe drop "(But they Don’t Have to Be)".');
        await comments.reply(note.ref, 'I like it long. It’s a promise.');
      });
    void annotation.create(second.ref, {
      subtype: 'highlight',
      quadPoints: [
        {
          upperLeft: { x: 57, y: 57 },
          upperRight: { x: 322, y: 57 },
          lowerLeft: { x: 57, y: 129 },
          lowerRight: { x: 322, y: 129 },
        },
      ],
      color: '#ffcd45',
      contents: 'A strong opening.',
    });
  },
  { immediate: true },
);
</script>

<template></template>
