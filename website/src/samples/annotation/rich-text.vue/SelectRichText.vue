<script setup lang="ts">
import { watch } from 'vue';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the document's rich text box, selected.
const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');
let done = false;

watch(
  ready,
  (isReady) => {
    if (!isReady || done) return;
    done = true;
    const richText = annotation.list().find((each) => each.nm === 'rich-text');
    if (!richText) return;
    annotation.selection.set([richText.ref]);
    stage.reveal(richText.page, { rect: richText.rect });
  },
  { immediate: true },
);
</script>

<template></template>
