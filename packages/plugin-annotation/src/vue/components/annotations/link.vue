<template>
  <svg
    :style="{
      position: 'absolute',
      width: `${svgWidth}px`,
      height: `${svgHeight}px`,
      pointerEvents: 'none',
      zIndex: 2,
    }"
    :width="svgWidth"
    :height="svgHeight"
    :viewBox="`0 0 ${width} ${height}`"
  >
    <!-- Invisible hit area for the entire link region -->
    <!-- IRT links are not directly clickable - interaction goes through parent -->
    <rect
      :x="0"
      :y="0"
      :width="width"
      :height="height"
      fill="transparent"
      @pointerdown="hasIRT ? undefined : onClick"
      @touchstart="hasIRT ? undefined : onClick"
      :style="{
        cursor: hitAreaCursor,
        pointerEvents: hitAreaPointerEvents,
      }"
    />

    <!-- Underline style: line at bottom of rect -->
    <line
      v-if="isUnderline"
      :x1="1"
      :y1="height - 1"
      :x2="width - 1"
      :y2="height - 1"
      :stroke="strokeColor"
      :stroke-width="strokeWidth"
      :stroke-dasharray="dashArray"
      style="pointer-events: none"
    />

    <!-- Solid/Dashed style: rectangle border -->
    <rect
      v-else
      :x="strokeWidth / 2"
      :y="strokeWidth / 2"
      :width="Math.max(width - strokeWidth, 0)"
      :height="Math.max(height - strokeWidth, 0)"
      fill="transparent"
      :stroke="strokeColor"
      :stroke-width="strokeWidth"
      :stroke-dasharray="dashArray"
      style="pointer-events: none"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PdfAnnotationBorderStyle, Rect } from '@embedpdf/models';

const props = withDefaults(
  defineProps<{
    /** Whether the annotation is selected */
    isSelected: boolean;
    /** Stroke colour – defaults to blue when omitted */
    strokeColor?: string;
    /** Stroke width in PDF units */
    strokeWidth?: number;
    /** Stroke type – defaults to underline when omitted */
    strokeStyle?: PdfAnnotationBorderStyle;
    /** Stroke dash array – for dashed style */
    strokeDashArray?: number[];
    /** Bounding box of the annotation (PDF units) */
    rect: Rect;
    /** Current page zoom factor */
    scale: number;
    /** Click handler (used for selection) */
    onClick?: (e: MouseEvent | TouchEvent) => void;
    /** Whether this link has an IRT (In Reply To) reference - disables direct interaction */
    hasIRT?: boolean;
  }>(),
  {
    strokeColor: '#0000FF',
    strokeWidth: 2,
    strokeStyle: PdfAnnotationBorderStyle.UNDERLINE,
    hasIRT: false,
  },
);

const width = computed(() => props.rect.size.width);
const height = computed(() => props.rect.size.height);
const svgWidth = computed(() => width.value * props.scale);
const svgHeight = computed(() => height.value * props.scale);

// Calculate dash array for SVG
const dashArray = computed(() => {
  if (props.strokeStyle === PdfAnnotationBorderStyle.DASHED) {
    return props.strokeDashArray?.join(',') ?? `${props.strokeWidth * 3},${props.strokeWidth}`;
  }
  return undefined;
});

// For underline style, render a line at the bottom
// For solid/dashed, render a rectangle border
const isUnderline = computed(() => props.strokeStyle === PdfAnnotationBorderStyle.UNDERLINE);

const hitAreaCursor = computed(() =>
  props.hasIRT ? 'default' : props.isSelected ? 'move' : 'pointer',
);
const hitAreaPointerEvents = computed(() =>
  props.hasIRT ? 'none' : props.isSelected ? 'none' : 'visible',
);
</script>
