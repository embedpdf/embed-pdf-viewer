<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';

// Something selected on load: the title on the cover.
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

watch(
  cover,
  (page) => {
    if (page) selection.select({ page, start: 10, count: 52 });
  },
  { immediate: true },
);
</script>

<template></template>
