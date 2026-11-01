<!-- On load: the middle one of the document's three stacked rectangles, selected. -->
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
    const stack2 = annotation.list().find((each) => each.nm === 'stack-2');
    if (!stack2) return;
    annotation.selection.set([stack2.ref]);
    stage.reveal(stack2.page, { rect: stack2.rect });
  },
  { immediate: true },
);
</script>

<template></template>
