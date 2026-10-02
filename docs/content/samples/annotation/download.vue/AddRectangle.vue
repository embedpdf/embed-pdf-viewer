<!-- On load: a rectangle on the cover, so there's a change to save. -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation, useAnnotationState } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
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
      subtype: 'square',
      box: { x: 96, y: 506, width: 178, height: 54 },
      color: '#e5484d',
      strokeWidth: 3,
    });
  },
  { immediate: true },
);
</script>

<template></template>
