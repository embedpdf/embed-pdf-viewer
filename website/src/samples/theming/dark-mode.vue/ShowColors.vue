<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue';
import { usePageList } from '@embedpdf/vue/runtime';
import { useSelection } from '@embedpdf/vue/selection';
import { useSearch } from '@embedpdf/vue/search';

const FIRST_WORD = { start: 28, count: 9 };

// On load: the first word is selected and "PDF" is found, so every color has something to paint.
const selection = useSelection();
const search = useSearch();
const pages = usePageList();
const cover = computed(() => pages.value[0]?.ref);

onMounted(() => {
  void search.search({ text: 'PDF' });
});
watchEffect(
  () => {
    if (cover.value) selection.select({ page: cover.value, ...FIRST_WORD });
  },
  { flush: 'post' },
);
</script>

<template></template>
