<template>
  <svg
    :style="{
      position: 'absolute',
      width: svgWidth,
      height: svgHeight,
      pointerEvents: 'none',
      zIndex: 2,
    }"
    :width="svgWidth"
    :height="svgHeight"
    :viewBox="`0 0 ${geometry.width} ${geometry.height}`"
    overflow="visible"
  >
    <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
    <ellipse
      :cx="geometry.cx"
      :cy="geometry.cy"
      :rx="geometry.rx"
      :ry="geometry.ry"
      fill="transparent"
      stroke="transparent"
      :stroke-width="hitStrokeWidth"
      @pointerdown="onClick"
      :style="{
        cursor: isSelected ? 'move' : 'pointer',
        pointerEvents: isSelected ? 'none' : color === 'transparent' ? 'visibleStroke' : 'visible',
      }"
    />
    <!-- Visual -- hidden when AP active, never interactive -->
    <ellipse
      v-if="!appearanceActive"
      :cx="geometry.cx"
      :cy="geometry.cy"
      :rx="geometry.rx"
      :ry="geometry.ry"
      :fill="color"
      :opacity="opacity"
      :style="{
        pointerEvents: 'none',
        stroke: strokeColor ?? color,
        strokeWidth: strokeWidth,
        ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
          strokeDasharray: strokeDashArray?.join(','),
        }),
      }"
    />
  </svg>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { PdfAnnotationBorderStyle, Rect } from '@embedpdf/models';

const MIN_HIT_AREA_SCREEN_PX = 20;

const props = withDefaults(
  defineProps<{
    isSelected: boolean;
    color?: string;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    strokeStyle?: PdfAnnotationBorderStyle;
    strokeDashArray?: number[];
    rect: Rect;
    scale: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }>(),
  {
    color: '#000000',
    opacity: 1,
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
    appearanceActive: false,
  },
);

const geometry = computed(() => {
  const outerW = props.rect.size.width;
  const outerH = props.rect.size.height;
  const innerW = Math.max(outerW - props.strokeWidth, 0);
  const innerH = Math.max(outerH - props.strokeWidth, 0);

  return {
    width: outerW,
    height: outerH,
    cx: props.strokeWidth / 2 + innerW / 2,
    cy: props.strokeWidth / 2 + innerH / 2,
    rx: innerW / 2,
    ry: innerH / 2,
  };
});

const svgWidth = computed(() => geometry.value.width * props.scale);
const svgHeight = computed(() => geometry.value.height * props.scale);
const hitStrokeWidth = computed(() =>
  Math.max(props.strokeWidth, MIN_HIT_AREA_SCREEN_PX / props.scale),
);
</script>
