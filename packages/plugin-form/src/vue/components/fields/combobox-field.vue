<script setup lang="ts">
import { computed } from 'vue';
import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import type { ComboboxFieldProps } from '../../../shared/components/types';
import { selectStyle } from './style';

const props = defineProps<ComboboxFieldProps>();

const field = computed(() => props.annotation.field);
const flag = computed(() => field.value.flag);
const options = computed(() => field.value.options);
const name = computed(() => field.value.alternateName || field.value.name);
const isDisabled = computed(
  () => !props.isEditable || !!(flag.value & PDF_FORM_FIELD_FLAG.READONLY),
);
const isRequired = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.REQUIRED));
const selectedIndex = computed(() => options.value.findIndex((o) => o.isSelected));

function handleChange(evt: Event) {
  const select = evt.target as HTMLSelectElement;
  const updatedOptions = options.value.map((opt, i) => ({
    ...opt,
    isSelected: i === select.selectedIndex,
  }));
  props.onChangeField?.({ ...field.value, options: updatedOptions });
}

function setInputRef(el: any) {
  props.inputRef?.(el as HTMLElement | null);
}
</script>

<template>
  <select
    :ref="setInputRef"
    :required="isRequired"
    :disabled="isDisabled"
    :name="name"
    :aria-label="name"
    @change="handleChange"
    @blur="props.onBlur?.()"
    :style="{ ...selectStyle, opacity: 0 }"
  >
    <option
      v-for="(option, index) in options"
      :key="index"
      :value="option.label"
      :selected="index === selectedIndex"
    >
      {{ option.label }}
    </option>
  </select>
</template>
