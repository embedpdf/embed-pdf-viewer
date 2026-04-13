<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import type { PdfWidgetAnnoObject } from '@embedpdf/models';
import { PDF_FORM_FIELD_TYPE, standardFontCssProperties } from '@embedpdf/models';

const props = defineProps<AnnotationRendererProps<PdfWidgetAnnoObject>>();

const isHovered = ref(false);

const object = computed(() => props.currentObject);
const field = computed(() => object.value.field);
const options = computed(() =>
  field.value.type === PDF_FORM_FIELD_TYPE.COMBOBOX ? field.value.options : [],
);
const selectedLabel = computed(() => options.value.find((o) => o.isSelected)?.label ?? '');
const borderWidth = computed(() => (object.value.strokeWidth ?? 1) * props.scale);
const fontSize = computed(() => (object.value.fontSize ?? 12) * props.scale);
const fontCss = computed(() => standardFontCssProperties(object.value.fontFamily));
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
      background: object.color ?? '#FFFFFF',
      border: `${borderWidth}px solid ${object.strokeColor ?? '#000000'}`,
      outline: isHovered || props.isSelected ? '1px solid rgba(66, 133, 244, 0.5)' : 'none',
      outlineOffset: '-1px',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      cursor: props.isSelected ? 'move' : 'pointer',
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
    }"
  >
    <span
      :style="{
        flex: '1',
        padding: `0 ${4 * props.scale}px`,
        fontSize: `${fontSize}px`,
        fontFamily: fontCss.fontFamily,
        fontWeight: fontCss.fontWeight,
        fontStyle: fontCss.fontStyle,
        color: object.fontColor ?? '#000000',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }"
      >{{ selectedLabel }}</span
    >
    <div
      :style="{
        width: `${13 * props.scale}px`,
        minWidth: `${13 * props.scale}px`,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderLeft: `1px solid ${object.strokeColor ?? '#000000'}`,
      }"
    >
      <svg
        viewBox="0 0 10 6"
        :style="{ width: `${8 * props.scale}px`, height: `${5 * props.scale}px` }"
        fill="currentColor"
      >
        <path d="M0 0 L5 6 L10 0 Z" />
      </svg>
    </div>
  </div>
</template>
