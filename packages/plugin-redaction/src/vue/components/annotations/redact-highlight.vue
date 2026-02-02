<template>
  <div
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    :style="{ position: 'absolute', inset: 0 }"
  >
    <div
      v-for="(b, i) in segmentRects"
      :key="i"
      @pointerdown="onClick"
      @touchstart="onClick"
      :style="getSegmentStyle(b)"
    >
      <span v-if="isHovered && overlayText" :style="getTextStyle(b)">
        {{ renderedOverlayText }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from 'vue';
import type { AnnotationRendererProps } from '@embedpdf/plugin-annotation/vue';
import type { PdfRedactAnnoObject, Rect } from '@embedpdf/models';
import {
  PdfStandardFont,
  PdfTextAlignment,
  standardFontCss,
  textAlignmentToCss,
} from '@embedpdf/models';

const props = defineProps<AnnotationRendererProps<PdfRedactAnnoObject>>();
const isHovered = ref(false);

// Access props.annotation.object directly in computed to maintain reactivity
const segmentRects = computed(() => props.annotation.object.segmentRects ?? []);
const rect = computed(() => props.annotation.object.rect);

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

const getSegmentStyle = (b: Rect): CSSProperties => ({
  position: 'absolute',
  left: `${(rect.value ? b.origin.x - rect.value.origin.x : b.origin.x) * props.scale}px`,
  top: `${(rect.value ? b.origin.y - rect.value.origin.y : b.origin.y) * props.scale}px`,
  width: `${b.size.width * props.scale}px`,
  height: `${b.size.height * props.scale}px`,
  // Default: transparent background with strokeColor (C) border
  // Hovered: color (IC) background fill, no border
  background: isHovered.value ? color.value : 'transparent',
  border: !isHovered.value ? `2px solid ${strokeColor.value}` : 'none',
  opacity: isHovered.value ? opacity.value : 1,
  boxSizing: 'border-box',
  pointerEvents: 'auto',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent:
    textAlign.value === PdfTextAlignment.Left
      ? 'flex-start'
      : textAlign.value === PdfTextAlignment.Right
        ? 'flex-end'
        : 'center',
  overflow: 'hidden',
});

const getTextStyle = (b: Rect): CSSProperties => ({
  color: textColor.value,
  fontSize: `${Math.min(fontSize.value * props.scale, b.size.height * props.scale * 0.8)}px`,
  fontFamily: standardFontCss(fontFamily.value),
  textAlign: textAlignmentToCss(textAlign.value),
  whiteSpace: overlayTextRepeat.value ? 'normal' : 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  lineHeight: 1,
});
</script>
