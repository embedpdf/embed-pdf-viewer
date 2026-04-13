<script setup lang="ts">
import { computed } from 'vue';
import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import type { PushButtonFieldProps } from '../../../shared/components/types';
import { buttonStyle } from './style';

const props = defineProps<PushButtonFieldProps>();

const field = computed(() => props.annotation.field);
const flag = computed(() => field.value.flag);
const name = computed(() => field.value.alternateName || field.value.name);
const isDisabled = computed(
  () => !props.isEditable || !!(flag.value & PDF_FORM_FIELD_FLAG.READONLY),
);
</script>

<template>
  <button :disabled="isDisabled" :aria-label="name" :style="buttonStyle">
    {{ name }}
  </button>
</template>
