<script setup lang="ts">
import { ref } from 'vue';
import { useMetadataEvent } from '@embedpdf/vue/metadata';

const notice = ref('');

useMetadataEvent(
  (metadata) => metadata.onUpdated,
  ({ metadata, origin }) => {
    if (origin.kind === 'remote') notice.value = `The title is now "${metadata.title}"`;
  },
);
</script>

<template>
  <p role="status">{{ notice }}</p>
</template>
