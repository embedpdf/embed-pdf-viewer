<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the page with the document's two approval stamps, the budget one already signed off.
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
      .filter((each) => each.nm === 'approval-budget' || each.nm === 'approval-contract');
    if (found.length === 0) return;
    stage.reveal(found[0].page, { rect: found[0].rect });
  },
  { immediate: true },
);
</script>

<template></template>
