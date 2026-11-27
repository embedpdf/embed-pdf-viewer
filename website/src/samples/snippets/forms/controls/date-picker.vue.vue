<!-- DatePicker.vue -->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Anchored } from '@embedpdf/vue/anchored';
import {
  formatDate,
  useForm,
  useFormEvent,
  useFormWidgetAnchor,
  type DatePartsInput,
  type FormFocusChangedEvent,
} from '@embedpdf/vue/form';
import Calendar from './Calendar.vue'; // your own

const form = useForm();
const focus = shallowRef<FormFocusChangedEvent | null>(null);
useFormEvent(
  (form) => form.onFocusChanged,
  (event) => (focus.value = event),
);
const anchor = useFormWidgetAnchor(() => focus.value?.widget ?? null);

// The date field the cursor is in, and the pattern of its dates.
const date = computed(() => {
  const field = focus.value?.field;
  const format = field && 'format' in field ? field.format : null;
  return field && format?.kind === 'date' ? { field, pattern: format.pattern } : null;
});

const pick = (day: DatePartsInput) => {
  if (!date.value) return;
  const { field, pattern } = date.value;
  // A text box writes what was typed when the cursor leaves it: the picked day goes in after.
  (document.activeElement as HTMLElement | null)?.blur();
  void form.setValue(field.ref, { value: formatDate(day, pattern) });
};
</script>

<template>
  <Anchored v-if="date" :anchor="anchor" placement="bottom-start">
    <!-- A press on the calendar leaves the cursor in the field until a day is picked. -->
    <div @mousedown.prevent>
      <Calendar @pick="pick" />
    </div>
  </Anchored>
</template>
