<script setup lang="ts">
import { computed } from 'vue';
import { PDF_FORM_FIELD_FLAG, isWidgetChecked } from '@embedpdf/models';
import type { CheckboxFieldProps } from '../../../shared/components/types';
import { checkboxStyle } from './style';

const props = defineProps<CheckboxFieldProps>();

const field = computed(() => props.annotation.field);
const flag = computed(() => field.value.flag);
const name = computed(() => field.value.alternateName || field.value.name);
const checked = computed(() => isWidgetChecked(props.annotation));
const isDisabled = computed(
  () => !props.isEditable || !!(flag.value & PDF_FORM_FIELD_FLAG.READONLY),
);
const isRequired = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.REQUIRED));

function handleChange(evt: Event) {
  const wantChecked = (evt.target as HTMLInputElement).checked;
  const newValue = wantChecked ? (props.annotation.exportValue ?? 'Yes') : 'Off';
  props.onChangeField?.({ ...field.value, value: newValue });
}
</script>

<template>
  <input
    type="checkbox"
    :required="isRequired"
    :disabled="isDisabled"
    :name="name"
    :aria-label="name"
    :value="field.value"
    :checked="checked"
    @change="handleChange"
    :style="checkboxStyle"
  />
</template>
