<script setup lang="ts">
import { ref } from 'vue';
import { useAttachmentEvent } from '@embedpdf/vue/attachment';

const notice = ref('');

useAttachmentEvent(
  (attachment) => attachment.onChanged,
  ({ type, files, origin }) => {
    if (origin.kind === 'remote') notice.value = `Someone ${type} ${files.length} file(s)`;
  },
);
</script>

<template>
  <p role="status">{{ notice }}</p>
</template>
