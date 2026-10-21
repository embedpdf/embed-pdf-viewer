<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useStage } from '@embedpdf/vue/stage';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

// On load: the shapes page, with everything on it selected.
const annotation = useAnnotation();
const stage = useStage();
const ready = useAnnotationState((state) => state.status === 'ready');
const pages = usePageList();
const shapes = computed(() => pages.value[2]?.ref);
let done = false;

watch(
  [ready, shapes],
  ([isReady, page]) => {
    if (!isReady || !page || done) return;
    done = true;
    annotation.selection.selectAll(page);
    stage.goToPage(page);
  },
  { immediate: true },
);
</script>

<template></template>
