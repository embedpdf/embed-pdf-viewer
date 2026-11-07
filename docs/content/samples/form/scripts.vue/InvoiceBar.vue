<!-- The amounts and the total are calculated by the form's scripts. -->
<script setup lang="ts">
import { ref } from 'vue';
import { toFieldRef, useFormEvent, useFormValue } from '@embedpdf/vue/form';

const total = useFormValue(toFieldRef('invoice.total'));
const refused = ref<string | null>(null);

// A script refused a value, such as a date that isn't day/month/year.
useFormEvent(
  (form) => form.onValidationRejected,
  ({ field, issues }) => (refused.value = `${field.name}: ${issues[0]?.message ?? 'refused'}`),
);
</script>

<template>
  <div class="toolbar">
    <output class="readout">
      Total: {{ total && 'value' in total && total.value ? total.value : 'type a quantity' }}
    </output>
    <output v-if="refused" class="refused">{{ refused }}</output>
  </div>
</template>
