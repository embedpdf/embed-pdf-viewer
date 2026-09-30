<script setup lang="ts">
import { ref } from 'vue';
import { useDocumentsEvent } from '@embedpdf/vue/runtime';

const message = ref('');

useDocumentsEvent(
  (documents) => documents.onOpenFailed,
  ({ error }) => (message.value = `Couldn't open the file: ${error.message}`),
);
</script>

<template>
  <p role="alert">{{ message }}</p>
</template>
