<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';

// The characters of the cover's title.
const TITLE = { start: 10, count: 52 };

// The cover's title is selected on load, so the accent shows; drag over any text to see more.
const selection = useSelection();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

watchEffect(
  () => {
    if (cover.value) selection.select({ page: cover.value, ...TITLE });
  },
  { flush: 'post' },
);
</script>

<template></template>
