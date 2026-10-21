<!-- On load: the document's frame and word, both selected, scrolled into view. -->
<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');

let done = false;
watch(
  ready,
  (isReady) => {
    if (!isReady || done) return;
    done = true;
    const found = annotation
      .list()
      .filter((each) => each.nm === 'checked-frame' || each.nm === 'checked-text');
    if (found.length === 0) return;
    annotation.selection.set(found.map((each) => each.ref));
    stage.reveal(found[0].page, { rect: found[0].rect });
  },
  { immediate: true },
);
</script>

<template></template>
