<!-- A calendar next to the date field the cursor is in. -->
<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { Anchored } from '@embedpdf/vue/anchored';
import {
  formatDate,
  parseDate,
  useForm,
  useFormEvent,
  useFormWidgetAnchor,
} from '@embedpdf/vue/form';
import type { DatePartsInput, FormFocusChangedEvent } from '@embedpdf/vue/form';
import Calendar from './Calendar.vue';
import { today } from './days';

const form = useForm();
const focus = shallowRef<FormFocusChangedEvent | null>(null);
useFormEvent(
  (form) => form.onFocusChanged,
  (event) => (focus.value = event),
);
const anchor = useFormWidgetAnchor(() => focus.value?.widget ?? null);

// A date field says so in its format, read from the PDF.
const date = computed(() => {
  const field = focus.value?.field;
  const format = field && 'format' in field ? field.format : null;
  if (!field || field.kind !== 'text' || format?.kind !== 'date') return null;
  return { field, pattern: format.pattern };
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
  <Anchored v-if="date" :anchor="anchor" placement="bottom-start" :gap="6">
    <!-- A press on the calendar leaves the cursor in the field until a day is picked. -->
    <div @mousedown.prevent>
      <Calendar
        :key="date.field.name"
        :shown="parseDate(date.field.value, date.pattern, today())"
        @pick="pick"
      />
    </div>
  </Anchored>
</template>
