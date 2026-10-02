<!-- On load: a rectangle and a text box on the cover, the rectangle selected and in view. -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const stage = useStage();
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
      subtype: 'free-text',
      box: { x: 300, y: 512, width: 230, height: 40 },
      contents: 'Copy me too',
      fontSize: 16,
      fontColor: '#1a2748',
      interiorColor: '#fffbe6',
    });
    void annotation
      .create(
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
      )
      .then(({ annotation: made }) => stage.reveal(page, { rect: made.rect }));
  },
  { immediate: true },
);
</script>

<template></template>
