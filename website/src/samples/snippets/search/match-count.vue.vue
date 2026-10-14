<script setup lang="ts">
import { ref } from 'vue';
import { useSearchEvent } from '@embedpdf/vue/search';

const message = ref('');

useSearchEvent(
  (search) => search.onCompleted,
  ({ hitCount }) => (message.value = `${hitCount} matches`),
);
</script>

<template>
  <p aria-live="polite">{{ message }}</p>
</template>
