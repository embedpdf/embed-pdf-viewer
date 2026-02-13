<template>
  <div
    @pointerdown="
      (e) => {
        if (!isSelected) onClick(e);
      }
    "
    @touchstart="
      (e) => {
        if (!isSelected) onClick(e);
      }
    "
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :style="containerStyle"
  >
    <span v-if="isHovered && overlayText" :style="textStyle">
      {{ renderedOverlayText }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import type { PdfRedactAnnoObject } from '@embedpdf/models';
import {
  PdfStandardFont,
  PdfTextAlignment,
  standardFontCssProperties,
  textAlignmentToCss,
} from '@embedpdf/models';

const props = defineProps<AnnotationRendererProps<PdfRedactAnnoObject>>();
const isHovered = ref(false);

// Access props.annotation.object directly in computed to maintain reactivity
// C - Border/stroke color
const strokeColor = computed(() => props.annotation.object.strokeColor ?? '#FF0000');
// IC - Interior color (background fill when redaction is applied)
const color = computed(() => props.annotation.object.color ?? '#000000');
// CA - Opacity (0-1)
const opacity = computed(() => props.annotation.object.opacity ?? 1);
// OC - Overlay text color (Adobe extension), fallback to fontColor
const textColor = computed(
  () => props.annotation.object.fontColor ?? props.annotation.object.overlayColor ?? '#FFFFFF',
);
// Overlay text properties
const overlayText = computed(() => props.annotation.object.overlayText);
const overlayTextRepeat = computed(() => props.annotation.object.overlayTextRepeat ?? false);
const fontSize = computed(() => props.annotation.object.fontSize ?? 12);
const fontFamily = computed(() => props.annotation.object.fontFamily ?? PdfStandardFont.Helvetica);
const textAlign = computed(() => props.annotation.object.textAlign ?? PdfTextAlignment.Center);

// Calculate how many times to repeat text (approximate)
const renderedOverlayText = computed(() => {
  if (!overlayText.value) return '';
  if (!overlayTextRepeat.value) return overlayText.value;
  // Repeat text multiple times to fill the space
  const reps = 10;
  return Array(reps).fill(overlayText.value).join(' ');
});

const containerStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  inset: 0,
  // Default: transparent background with strokeColor (C) border
  // Hovered: color (IC) background fill, no border
  background: isHovered.value ? color.value : 'transparent',
  border: !isHovered.value ? `2px solid ${strokeColor.value}` : 'none',
  opacity: isHovered.value ? opacity.value : 1,
  boxSizing: 'border-box',
  pointerEvents: 'auto',
  cursor: props.isSelected ? 'move' : 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent:
    textAlign.value === PdfTextAlignment.Left
      ? 'flex-start'
      : textAlign.value === PdfTextAlignment.Right
        ? 'flex-end'
        : 'center',
  overflow: 'hidden',
}));

const textStyle = computed<CSSProperties>(() => ({
  color: textColor.value,
  fontSize: `${fontSize.value * props.scale}px`,
  ...standardFontCssProperties(fontFamily.value),
  textAlign: textAlignmentToCss(textAlign.value),
  whiteSpace: overlayTextRepeat.value ? 'normal' : 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  padding: '4px',
}));
</script>
