<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSearch } from '@embedpdf/vue/search';
import { useSelection } from '@embedpdf/vue/selection';

// Something on every layer on load: the matches of a search, and the first word selected.
const search = useSearch();
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

void search.search({ text: 'PDF' });
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
