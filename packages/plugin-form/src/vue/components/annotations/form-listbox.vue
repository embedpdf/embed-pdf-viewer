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
  field.value.type === PDF_FORM_FIELD_TYPE.LISTBOX ? field.value.options : [],
);
const borderWidth = computed(() => (object.value.strokeWidth ?? 1) * props.scale);
const fontSize = computed(() => (object.value.fontSize ?? 12) * props.scale);
const lineHeight = computed(() => fontSize.value * 1.2);
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
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }"
  >
    <div
      v-for="(opt, i) in options"
      :key="i"
      :style="{
        padding: `0 ${4 * props.scale}px`,
        fontSize: `${fontSize}px`,
        lineHeight: `${lineHeight}px`,
        fontFamily: fontCss.fontFamily,
        fontWeight: fontCss.fontWeight,
        fontStyle: fontCss.fontStyle,
        color: opt.isSelected ? '#FFFFFF' : (object.fontColor ?? '#000000'),
        background: opt.isSelected ? 'rgba(0, 51, 113, 1)' : 'transparent',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }"
    >
      {{ opt.label }}
    </div>
  </div>
</template>
