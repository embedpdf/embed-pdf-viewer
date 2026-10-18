<script setup lang="ts">
import { ref } from 'vue';
import { useOutlineEvent } from '@embedpdf/vue/outline';

const notice = ref('');

useOutlineEvent(
  (outline) => outline.onChanged,
  ({ type, items, origin }) => {
    if (origin.kind === 'remote') notice.value = `Someone ${type} ${items.length} bookmark(s)`;
  },
);
</script>

<template>
  <p role="status">{{ notice }}</p>
</template>
