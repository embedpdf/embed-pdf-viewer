<script setup lang="ts">
import { computed, watch } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';

// Something selected on load: "Documents", the first word on the cover.
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

watch(
  cover,
  (page) => {
    if (page) selection.select({ page, start: 36, count: 9 });
  },
  { immediate: true },
);
</script>

<template></template>
