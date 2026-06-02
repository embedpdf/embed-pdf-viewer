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
      fill="none"
      stroke="transparent"
      :stroke-width="hitStrokeWidth"
      @pointerdown="onClick"
      :style="{
        cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
        pointerEvents: !onClick ? 'none' : isSelected ? 'none' : 'visibleStroke',
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
      }"
    />
    <path
      v-if="endings.start"
      :d="endings.start.d"
      :transform="endings.start.transform"
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
            : endings.start.filled
              ? 'visible'
              : 'visibleStroke',
        strokeLinecap: 'butt',
      }"
    />
    <path
      v-if="endings.end"
      :d="endings.end.d"
      :transform="endings.end.transform"
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
            : endings.end.filled
              ? 'visible'
              : 'visibleStroke',
        strokeLinecap: 'butt',
      }"
    />

    <!-- Visual -- hidden when AP active, never interactive -->
    <template v-if="!appearanceActive">
      <path
        :d="pathData"
        :opacity="opacity"
        :style="{
          fill: 'none',
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
        v-if="endings.start"
        :d="endings.start.d"
        :transform="endings.start.transform"
        :stroke="strokeColor"
        :fill="endings.start.filled ? color : 'none'"
        :style="{
          pointerEvents: 'none',
          strokeWidth,
          strokeLinecap: 'butt',
          ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
            strokeDasharray: strokeDashArray?.join(','),
          }),
        }"
      />
      <path
        v-if="endings.end"
        :d="endings.end.d"
        :transform="endings.end.transform"
        :stroke="strokeColor"
        :fill="endings.end.filled ? color : 'none'"
        :style="{
          pointerEvents: 'none',
          strokeWidth,
          strokeLinecap: 'butt',
          ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
            strokeDasharray: strokeDashArray?.join(','),
          }),
        }"
      />
    </template>

    <MeasurementLabel
      v-if="measure"
      :text="measure.text"
      :center="measure.center"
      :scale="scale"
      :background="strokeColor"
    />
  </svg>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Rect,
  Position,
  LineEndings,
  PdfAnnotationBorderStyle,
  PdfMeasurementInfo,
  formatMeasurement,
  polygonArea,
  polylineLength,
} from '@embedpdf/models';
import { patching } from '@embedpdf/plugin-annotation';
import MeasurementLabel from './measurement-label.vue';

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
    onClick?: (e: PointerEvent) => void;
    lineEndings?: LineEndings;
    appearanceActive?: boolean;
    measurement?: PdfMeasurementInfo;
  }>(),
  {
    color: 'transparent',
    strokeColor: '#000000',
    opacity: 1,
    strokeStyle: PdfAnnotationBorderStyle.SOLID,
    appearanceActive: false,
  },
);

const localPts = computed(() =>
  props.vertices.map(({ x, y }) => ({
    x: x - props.rect.origin.x,
    y: y - props.rect.origin.y,
  })),
);

const pathData = computed(() => {
  if (localPts.value.length === 0) return '';
  const [first, ...rest] = localPts.value;
  return (`M ${first.x} ${first.y} ` + rest.map((p) => `L ${p.x} ${p.y} `).join('')).trim();
});

const endings = computed(() => {
  if (localPts.value.length < 2) return { start: null, end: null };
  const toAngle = (a: Position, b: Position) => Math.atan2(b.y - a.y, b.x - a.x);

  const startRad = toAngle(localPts.value[0], localPts.value[1]);
  const endRad = toAngle(
    localPts.value[localPts.value.length - 2],
    localPts.value[localPts.value.length - 1],
  );

  return {
    start: patching.createEnding(
      props.lineEndings?.start,
      props.strokeWidth,
      startRad + Math.PI,
      localPts.value[0].x,
      localPts.value[0].y,
    ),
    end: patching.createEnding(
      props.lineEndings?.end,
      props.strokeWidth,
      endRad,
      localPts.value[localPts.value.length - 1].x,
      localPts.value[localPts.value.length - 1].y,
    ),
  };
});

const width = computed(() => props.rect.size.width * props.scale);
const height = computed(() => props.rect.size.height * props.scale);
const hitStrokeWidth = computed(() =>
  Math.max(props.strokeWidth, MIN_HIT_AREA_SCREEN_PX / props.scale),
);

const measure = computed(() => {
  const pts = localPts.value;
  if (!props.measurement || pts.length === 0) return null;
  const value =
    props.measurement.mode === 'area'
      ? polygonArea(props.vertices)
      : polylineLength(props.vertices);
  const center = pts.reduce(
    (acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }),
    { x: 0, y: 0 },
  );
  return { text: formatMeasurement(value, props.measurement), center };
});
</script>
