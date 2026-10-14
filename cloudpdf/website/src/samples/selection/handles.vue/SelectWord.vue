<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';

// A word selected on load, as a long-press selects one: "Viewers", on the cover.
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

watch(
  cover,
  (page) => {
    if (page) selection.select({ page, start: 14, count: 7 });
  },
  { immediate: true },
);
</script>

<template></template>
