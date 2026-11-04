<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';

// The characters of "Documents", the first word on the cover.
// [!doc-range welcome firstWord]
const FIRST_WORD = { start: 28, count: 9 };
// [!/doc-range]

// The first word is selected on load, so the accent shows; drag over any text to see more.
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

watchEffect(
  () => {
    if (cover.value) selection.select({ page: cover.value, ...FIRST_WORD });
  },
  { flush: 'post' },
);
</script>

<template></template>
