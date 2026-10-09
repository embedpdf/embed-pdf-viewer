<script setup lang="ts">
import { ref } from 'vue';
import { useDocumentsEvent } from '@embedpdf/vue/runtime';

const pageCount = ref(0);

useDocumentsEvent(
  (documents) => documents.onPagesChanged,
  ({ pages }) => (pageCount.value = pages.length),
);
</script>

<template>
  <span>{{ pageCount }} pages</span>
</template>
