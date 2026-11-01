<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the document's circle, selected. Drag it toward the square to see it snap.
const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');
let done = false;

watch(
  ready,
  (isReady) => {
    if (!isReady || done) return;
    done = true;
    const circle = annotation.list().find((each) => each.nm === 'circle');
    if (!circle) return;
    annotation.selection.set([circle.ref]);
    stage.reveal(circle.page, { rect: circle.rect });
  },
  { immediate: true },
);
</script>

<template></template>
