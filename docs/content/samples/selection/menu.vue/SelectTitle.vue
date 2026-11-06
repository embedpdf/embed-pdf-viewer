<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';

// Something selected on load, so the menu shows: "Documents", the first word on the cover.
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

watch(
  cover,
  (page) => {
    // [!doc-range welcome firstWord]
    if (page) selection.select({ page, start: 28, count: 9 });
    // [!/doc-range]
  },
  { immediate: true },
);
</script>

<template></template>
