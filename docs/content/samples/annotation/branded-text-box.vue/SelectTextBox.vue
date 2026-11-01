<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the document's text box, selected, drawn by your component.
const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');
let done = false;

watch(
  ready,
  (isReady) => {
    if (!isReady || done) return;
    done = true;
    const textBox = annotation.list().find((each) => each.nm === 'text-box');
    if (!textBox) return;
    annotation.selection.set([textBox.ref]);
    stage.reveal(textBox.page, { rect: textBox.rect });
  },
  { immediate: true },
);
</script>

<template></template>
