<template>
  <svg
    :style="{
      position: 'absolute',
      width: `${width}px`,
      height: `${height}px`,
      pointerEvents: 'none',
      zIndex: 2,
      overflow: 'visible',
    }"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${rect.size.width} ${rect.size.height}`"
  >
    <!-- Hit area -- always rendered, transparent, wider stroke for mobile -->
    <path
      :d="pathData"
      fill="transparent"
      stroke="transparent"
      :stroke-width="hitStrokeWidth"
      @pointerdown="onClick"
      @touchstart="onClick"
      :style="{
        cursor: isSelected ? 'move' : 'pointer',
        pointerEvents: isSelected ? 'none' : color === 'transparent' ? 'visibleStroke' : 'visible',
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
      }"
    />

    <!-- Visual -- hidden when AP active, never interactive -->
    <template v-if="!appearanceActive">
      <path
        :d="pathData"
        :opacity="opacity"
        :style="{
          fill: currentVertex ? 'none' : color,
          stroke: strokeColor ?? color,
          strokeWidth,
          pointerEvents: 'none',
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
          ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
            strokeDasharray: strokeDashArray?.join(','),
          }),
        }"
      />
      <path
        v-if="isPreviewing && localPts.length > 1"
        :d="`M ${localPts[localPts.length - 1].x} ${
          localPts[localPts.length - 1].y
        } L ${localPts[0].x} ${localPts[0].y}`"
        fill="none"
        :style="{
          stroke: strokeColor,
          strokeWidth,
          strokeDasharray: '4,4',
          opacity: 0.7,
          pointerEvents: 'none',
        }"
      />
      <rect
        v-if="isPreviewing && localPts.length >= 2"
        :x="localPts[0].x - handleSize / scale / 2"
        :y="localPts[0].y - handleSize / scale / 2"
        :width="handleSize / scale"
        :height="handleSize / scale"
        :fill="strokeColor"
        :opacity="0.4"
        :stroke="strokeColor"
        :stroke-width="strokeWidth / 2"
        style="pointer-events: none"
      />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Rect, Position, PdfAnnotationBorderStyle } from '@embedpdf/models';

const MIN_HIT_AREA_SCREEN_PX = 20;

const props = withDefaults(
  defineProps<{
    rect: Rect;
    vertices: Position[];
    color?: string;
    strokeColor?: string;
    opacity?: number;
    strokeWidth: number;
    strokeStyle?: PdfAnnotationBorderStyle;
    strokeDashArray?: number[];
    scale: number;
    isSelected: boolean;
    onClick?: (e: PointerEvent | TouchEvent) => void;
    currentVertex?: Position;
    handleSize?: number;
    appearanceActive?: boolean;
  }>(),
  {
    color: 'transparent',
    strokeColor: '#000000',
    opacity: 1,
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
    handleSize: 14,
    appearanceActive: false,
  },
);

const allPoints = computed(() =>
  props.currentVertex ? [...props.vertices, props.currentVertex] : props.vertices,
);

const localPts = computed(() =>
  allPoints.value.map(({ x, y }) => ({
    x: x - props.rect.origin.x,
    y: y - props.rect.origin.y,
  })),
);

const pathData = computed(() => {
  if (!localPts.value.length) return '';
  const [first, ...rest] = localPts.value;
  const isPreview = !!props.currentVertex;
  return (
    `M ${first.x} ${first.y} ` +
    rest.map((p) => `L ${p.x} ${p.y}`).join(' ') +
    (isPreview ? '' : ' Z')
  ).trim();
});

const isPreviewing = computed(() => props.currentVertex && props.vertices.length > 0);

const width = computed(() => props.rect.size.width * props.scale);
const height = computed(() => props.rect.size.height * props.scale);
const hitStrokeWidth = computed(() =>
  Math.max(props.strokeWidth, MIN_HIT_AREA_SCREEN_PX / props.scale),
);
</script>
