<script setup lang="ts">
import { computed } from 'vue';
import { PDF_FORM_FIELD_FLAG, isWidgetChecked, type PdfWidgetAnnoOption } from '@embedpdf/models';
import type { RadioButtonFieldProps } from '../../../shared/components/types';
import { buttonStyle } from './style';

const props = defineProps<RadioButtonFieldProps>();

const field = computed(() => props.annotation.field);
const flag = computed(() => field.value.flag);
const name = computed(() => field.value.alternateName || field.value.name);
const checked = computed(() => isWidgetChecked(props.annotation));
const defaultValue = computed(() => {
  const option = field.value.options.find((o: PdfWidgetAnnoOption) => o.isSelected);
  return option?.label || field.value.value;
});
const isDisabled = computed(
  () => !props.isEditable || !!(flag.value & PDF_FORM_FIELD_FLAG.READONLY),
);
const isRequired = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.REQUIRED));

function handleChange(evt: Event) {
  const wantChecked = (evt.target as HTMLInputElement).checked;
  if (wantChecked && props.annotation.exportValue) {
    props.onChangeField?.({ ...field.value, value: props.annotation.exportValue });
  }
}
</script>

<template>
  <input
    type="radio"
    :required="isRequired"
    :disabled="isDisabled"
    :name="name"
    :aria-label="name"
    :value="defaultValue"
    :checked="checked"
    @change="handleChange"
    :style="buttonStyle"
  />
</template>
