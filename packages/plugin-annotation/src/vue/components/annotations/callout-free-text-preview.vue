<script setup lang="ts">
import { computed } from 'vue';
import { Rect, PdfAnnotationLineEnding, Position } from '@embedpdf/models';
import { FreeTextPreviewData, patching } from '@embedpdf/plugin-annotation';

const props = defineProps<{
  data: FreeTextPreviewData;
  bounds: Rect;
  scale: number;
}>();

const cl = computed(() => props.data.calloutLine);
const sw = computed(() => props.data.strokeWidth ?? 1);
const sc = computed(() => props.data.strokeColor ?? '#000000');
const op = computed(() => props.data.opacity ?? 1);
const w = computed(() => props.bounds.size.width);
const h = computed(() => props.bounds.size.height);
const ox = computed(() => props.bounds.origin.x);
const oy = computed(() => props.bounds.origin.y);

const lineCoords = computed(() => {
  const line = cl.value;
  if (!line || line.length < 2) return null;
  return line.map((p) => ({ x: p.x - ox.value, y: p.y - oy.value }));
});

const ending = computed(() => {
  const lc = lineCoords.value;
  if (!lc || lc.length < 2) return null;
  const angle = Math.atan2(lc[1].y - lc[0].y, lc[1].x - lc[0].x);
  return patching.createEnding(props.data.lineEnding, sw.value, angle + Math.PI, lc[0].x, lc[0].y);
});

const halfSw = computed(() => sw.value / 2);
const tb = computed(() => props.data.textBox);
</script>

<template>
  <svg
    v-if="lineCoords"
    :style="{
      position: 'absolute',
      width: `${w * scale}px`,
      height: `${h * scale}px`,
      pointerEvents: 'none',
      overflow: 'visible',
    }"
    :width="w * scale"
    :height="h * scale"
    :viewBox="`0 0 ${w} ${h}`"
  >
    <polyline
      :points="lineCoords.map((p: any) => `${p.x},${p.y}`).join(' ')"
      fill="none"
      :stroke="sc"
      :stroke-width="sw"
      :opacity="op"
    />
    <path
      v-if="ending"
      :d="ending.d"
      :transform="ending.transform"
      :stroke="sc"
      :fill="ending.filled ? (data.color ?? 'transparent') : 'none'"
      :stroke-width="sw"
      :opacity="op"
    />
    <rect
      v-if="tb"
      :x="tb.origin.x - ox + halfSw"
      :y="tb.origin.y - oy + halfSw"
      :width="tb.size.width - sw"
      :height="tb.size.height - sw"
      :fill="data.color ?? data.backgroundColor ?? 'transparent'"
      :stroke="sc"
      :stroke-width="sw"
      :opacity="op"
    />
  </svg>
</template>
