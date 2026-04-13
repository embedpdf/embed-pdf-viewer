<script setup lang="ts">
import { computed, type CSSProperties } from 'vue';
import { PDF_FORM_FIELD_FLAG, standardFontCssProperties } from '@embedpdf/models';
import type { ListboxFieldProps } from '../../../shared/components/types';

const props = defineProps<ListboxFieldProps>();

const field = computed(() => props.annotation.field);
const flag = computed(() => field.value.flag);
const options = computed(() => field.value.options);
const isDisabled = computed(
  () => !props.isEditable || !!(flag.value & PDF_FORM_FIELD_FLAG.READONLY),
);
const isMultipleChoice = computed(() => !!(flag.value & PDF_FORM_FIELD_FLAG.CHOICE_MULTL_SELECT));

const bw = computed(() => (props.annotation.strokeWidth ?? 0) * props.scale);
const fontSize = computed(() => (props.annotation.fontSize ?? 12) * props.scale);
const lineHeight = computed(() => fontSize.value * 1.2);
const fontCss = computed(() => standardFontCssProperties(props.annotation.fontFamily));

const containerStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  background: props.annotation.color ?? '#FFFFFF',
  borderStyle: 'solid',
  borderColor: props.annotation.strokeColor ?? '#000000',
  borderWidth: `${bw.value}px`,
  boxSizing: 'border-box',
  overflow: 'auto',
  display: 'flex',
  flexDirection: 'column',
  outline: 'none',
}));

function handleOptionClick(clickedIndex: number) {
  if (isDisabled.value) return;
  const updatedOptions = options.value.map((opt, i) => ({
    ...opt,
    isSelected: isMultipleChoice.value
      ? i === clickedIndex
        ? !opt.isSelected
        : opt.isSelected
      : i === clickedIndex,
  }));
  props.onChangeField?.({ ...field.value, options: updatedOptions });
}

function setInputRef(el: any) {
  props.inputRef?.(el as HTMLElement | null);
}
</script>

<template>
  <div :ref="setInputRef" @blur="props.onBlur?.()" :style="containerStyle">
    <div
      v-for="(opt, i) in options"
      :key="i"
      @click="handleOptionClick(i)"
      :style="{
        padding: `0 ${4 * props.scale}px`,
        fontSize: `${fontSize}px`,
        lineHeight: `${lineHeight}px`,
        fontFamily: fontCss.fontFamily,
        fontWeight: fontCss.fontWeight,
        fontStyle: fontCss.fontStyle,
        color: opt.isSelected ? '#FFFFFF' : (props.annotation.fontColor ?? '#000000'),
        background: opt.isSelected ? 'rgba(0, 51, 113, 1)' : 'transparent',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        cursor: isDisabled ? 'default' : 'pointer',
      }"
    >
      {{ opt.label }}
    </div>
  </div>
</template>
