<script setup lang="ts">
import { useFormState } from '@embedpdf/vue/form';
import type { FormField } from '@embedpdf/vue/form';

const { fields } = useFormState();

/** A field's value as text, whatever its kind. */
function valueText(field: FormField): string {
  switch (field.kind) {
    case 'text':
    case 'combobox':
      return field.value || '—';
    case 'checkbox':
      return field.checked ? 'checked' : 'not checked';
    case 'radio':
      return field.value === 'Off' ? '—' : field.value;
    case 'listbox':
      return field.selectedValues.join(', ') || '—';
    default:
      return '';
  }
}
</script>

<template>
  <ul class="fields">
    <li v-for="field in fields" :key="field.name" class="field">
      <span class="field-name">
        {{ field.name }} <span class="kind">{{ field.kind }}</span>
      </span>
      <span class="field-value">{{ valueText(field) }}</span>
    </li>
  </ul>
</template>
