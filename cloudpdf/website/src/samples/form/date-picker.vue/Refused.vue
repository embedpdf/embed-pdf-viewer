<!-- What the form refused last, so a mistyped date says why. -->
<script setup lang="ts">
import { ref } from 'vue';
import { useFormEvent } from '@embedpdf/vue/form';

const refused = ref<string | null>(null);

useFormEvent(
  (form) => form.onValidationRejected,
  ({ issues }) => (refused.value = issues[0]?.message ?? 'The form refused that value.'),
);
useFormEvent(
  (form) => form.onValueChanged,
  () => (refused.value = null),
);
</script>

<template>
  <div class="toolbar">
    <output class="readout">{{ refused ?? 'Click the order date, or type one.' }}</output>
  </div>
</template>
