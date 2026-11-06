<script setup lang="ts">
import { ref } from 'vue';
import { useStampEvent } from '@embedpdf/vue/stamp';

const message = ref('');

useStampEvent(
  (stamp) => stamp.onLibraryChanged,
  ({ libraryId, type }) => (message.value = `${libraryId}: ${type}`),
);
</script>

<template>
  <p aria-live="polite">{{ message }}</p>
</template>
