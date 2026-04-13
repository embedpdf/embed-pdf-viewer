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
    :viewBox="`0 0 ${rect.size.width} ${rect.size.height}`"
    overflow="visible"
  >
    <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
    <path
      v-if="isCloudy && cloudyPath"
      :d="cloudyPath.path"
      fill="transparent"
      stroke="transparent"
      :stroke-width="hitStrokeWidth"
      @pointerdown="onClick"
      :style="{
        cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
        pointerEvents: !onClick
          ? 'none'
          : isSelected
            ? 'none'
            : color === 'transparent'
              ? 'visibleStroke'
              : 'visible',
      }"
    />
    <rect
      v-else
      :x="geometry.x"
      :y="geometry.y"
      :width="geometry.width"
      :height="geometry.height"
      fill="transparent"
      stroke="transparent"
      :stroke-width="hitStrokeWidth"
      @pointerdown="onClick"
      :style="{
        cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
        pointerEvents: !onClick
          ? 'none'
          : isSelected
            ? 'none'
            : color === 'transparent'
              ? 'visibleStroke'
              : 'visible',
      }"
    />
    <!-- Visual -- hidden when AP active, never interactive -->
    <template v-if="!appearanceActive">
      <path
        v-if="isCloudy && cloudyPath"
        :d="cloudyPath.path"
        :fill="color"
        :opacity="opacity"
        :style="{
          pointerEvents: 'none',
          stroke: strokeColor ?? color,
          strokeWidth: strokeWidth,
          strokeLinejoin: 'round',
        }"
      />
      <rect
        v-else
        :x="geometry.x"
        :y="geometry.y"
        :width="geometry.width"
        :height="geometry.height"
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
    </template>
  </svg>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { PdfAnnotationBorderStyle, PdfRectDifferences, Rect } from '@embedpdf/models';
import { generateCloudyRectanglePath } from '@embedpdf/plugin-annotation';

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
    cloudyBorderIntensity?: number;
    rectangleDifferences?: PdfRectDifferences;
  }>(),
  {
    color: '#000000',
    opacity: 1,
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
    appearanceActive: false,
  },
);

const isCloudy = computed(() => (props.cloudyBorderIntensity ?? 0) > 0);

const geometry = computed(() => {
  const outerW = props.rect.size.width;
  const outerH = props.rect.size.height;
  const innerW = Math.max(outerW - props.strokeWidth, 0);
  const innerH = Math.max(outerH - props.strokeWidth, 0);

  return {
    width: innerW,
    height: innerH,
    x: props.strokeWidth / 2,
    y: props.strokeWidth / 2,
  };
});

const cloudyPath = computed(() => {
  if (!isCloudy.value) return null;
  return generateCloudyRectanglePath(
    { x: 0, y: 0, width: props.rect.size.width, height: props.rect.size.height },
    props.rectangleDifferences,
    props.cloudyBorderIntensity!,
    props.strokeWidth,
  );
});

const svgWidth = computed(() => props.rect.size.width * props.scale);
const svgHeight = computed(() => props.rect.size.height * props.scale);
const hitStrokeWidth = computed(() =>
  Math.max(props.strokeWidth, MIN_HIT_AREA_SCREEN_PX / props.scale),
);
</script>
