<script setup lang="ts">
import { ref } from 'vue';
import { useDocumentsEvent } from '@embedpdf/vue/runtime';

const entries = ref<string[]>([]);

useDocumentsEvent(
  (documents) => documents.onUnsavedChangesChanged,
  ({ hasUnsavedChanges }) => {
    entries.value = [
      hasUnsavedChanges ? 'It has changes that weren’t downloaded' : 'Downloaded: nothing to lose',
      ...entries.value,
    ];
  },
);
</script>

<template>
  <ul class="log" aria-live="polite">
    <li v-for="(entry, index) in entries.slice(0, 3)" :key="entries.length - index">
      {{ entry }}
    </li>
  </ul>
</template>
