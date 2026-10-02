<!-- A rectangle on the first page, made on load so there's an annotation to show. -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useAnnotation } from '@embedpdf/vue/annotation';

const annotation = useAnnotation();
const pages = usePageList();
const firstPage = computed(() => pages.value[0]?.ref);

let added = false;
watch(
  firstPage,
  (page) => {
    if (!page || added) return;
    added = true;
    void annotation.create(page, {
      subtype: 'square',
      box: { x: 72, y: 96, width: 300, height: 140 },
      color: '#e11d48',
      interiorColor: '#ffe4e6',
      opacity: 0.7,
      strokeWidth: 3,
    });
  },
  { immediate: true },
);
</script>

<template></template>
