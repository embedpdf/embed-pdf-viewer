<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import type { PdfWidgetAnnoObject, PdfTextWidgetAnnoField } from '@embedpdf/models';
import {
  PDF_FORM_FIELD_TYPE,
  PDF_FORM_FIELD_FLAG,
  standardFontCssProperties,
} from '@embedpdf/models';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();

const isHovered = ref(false);

const object = computed(() => props.currentObject);
const field = computed(() => object.value.field);
const isTextField = computed(() => field.value.type === PDF_FORM_FIELD_TYPE.TEXTFIELD);
const value = computed(() =>
  isTextField.value ? (field.value as PdfTextWidgetAnnoField).value : '',
);
const isComb = computed(
  () =>
    isTextField.value &&
    !!(field.value.flag & PDF_FORM_FIELD_FLAG.TEXT_COMB) &&
    !!(field.value as PdfTextWidgetAnnoField).maxLen,
);
const isMultiline = computed(
  () => isTextField.value && !!(field.value.flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE),
);
const maxLen = computed(() =>
  isTextField.value ? (field.value as PdfTextWidgetAnnoField).maxLen : undefined,
);
const borderWidth = computed(() => (object.value.strokeWidth ?? 1) * props.scale);
const fontCss = computed(() => standardFontCssProperties(object.value.fontFamily));
const fontSize = computed(() => (object.value.fontSize ?? 12) * props.scale);
const fontColor = computed(() => object.value.fontColor ?? '#000000');

const cellWidth = computed(() =>
  isComb.value && maxLen.value ? (object.value.rect.size.width * props.scale) / maxLen.value : 0,
);
const chars = computed(() => (value.value ?? '').split(''));
</script>

<template>
  <div
    @pointerdown="
      (e) => {
        if (!props.isSelected) props.onClick?.(e);
      }
    "
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :style="{
      position: 'absolute',
      inset: '0',
      background: object.color ?? 'rgba(255, 255, 255, 0.9)',
      border: `${borderWidth}px solid ${object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}`,
      outline: isHovered || props.isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
      outlineOffset: '-1px',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      cursor: props.isSelected ? 'move' : 'pointer',
      display: 'flex',
      alignItems: isMultiline ? 'flex-start' : 'center',
      overflow: 'hidden',
      padding: !isComb ? `${borderWidth}px ${borderWidth}px` : undefined,
    }"
  >
    <template v-if="isComb && maxLen">
      <div style="position: relative; width: 100%; height: 100%">
        <span
          v-for="(_, i) in Array.from({ length: maxLen })"
          :key="i"
          :style="{
            position: 'absolute',
            top: '0',
            left: `${i * cellWidth}px`,
            width: `${cellWidth}px`,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRight:
              i < maxLen - 1 ? `1px solid ${object.strokeColor ?? 'rgba(0, 0, 0, 0.2)'}` : 'none',
            boxSizing: 'border-box',
            fontSize: `${fontSize}px`,
            fontFamily: fontCss.fontFamily,
            fontWeight: fontCss.fontWeight,
            fontStyle: fontCss.fontStyle,
            color: fontColor,
            lineHeight: '1.2',
          }"
          >{{ chars[i] || '' }}</span
        >
      </div>
    </template>
    <template v-else>
      <span
        :style="{
          fontSize: `${fontSize}px`,
          fontFamily: fontCss.fontFamily,
          fontWeight: fontCss.fontWeight,
          fontStyle: fontCss.fontStyle,
          color: fontColor,
          lineHeight: '1.2',
          display: 'block',
          width: '100%',
          whiteSpace: isMultiline ? 'pre-wrap' : 'nowrap',
          wordBreak: isMultiline ? 'break-word' : 'normal',
          overflowWrap: isMultiline ? 'break-word' : 'normal',
          overflow: 'hidden',
          textOverflow: isMultiline ? 'clip' : 'ellipsis',
        }"
        >{{ value }}</span
      >
    </template>
  </div>
</template>
