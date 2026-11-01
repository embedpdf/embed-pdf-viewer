<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the document's square, selected, on its page.
const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');
let done = false;

watch(
  ready,
  (isReady) => {
    if (!isReady || done) return;
    done = true;
    const square = annotation.list().find((each) => each.nm === 'square');
    if (!square) return;
    annotation.selection.set([square.ref]);
    stage.reveal(square.page, { rect: square.rect });
  },
  { immediate: true },
);
</script>

<template></template>
