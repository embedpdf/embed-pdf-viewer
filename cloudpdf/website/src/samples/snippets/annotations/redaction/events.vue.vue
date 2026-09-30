<script setup lang="ts">
import { ref } from 'vue';
import { useRedactionEvent } from '@embedpdf/vue/redaction';

const message = ref('');

useRedactionEvent(
  (redaction) => redaction.onApplied,
  () => (message.value = 'Redacted: the content under the marks is gone'),
);
</script>

<template>
  <p aria-live="polite">{{ message }}</p>
</template>
