<template>
  <div
    v-for="(r, i) in segmentRects"
    :key="i"
    @pointerdown="onClick"
    @touchstart="onClick"
    :style="{
      position: 'absolute',
      left: `${(rect ? r.origin.x - rect.origin.x : r.origin.x) * scale}px`,
      top: `${(rect ? r.origin.y - rect.origin.y : r.origin.y) * scale}px`,
      width: `${r.size.width * scale}px`,
      height: `${r.size.height * scale}px`,
      background: 'transparent',
      pointerEvents: onClick ? 'auto' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      zIndex: onClick ? 1 : 0,
    }"
  >
    <div
      :style="{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: '100%',
        height: `${amplitude * 2}px`,
        backgroundImage: svgDataUri,
        backgroundRepeat: 'repeat-x',
        backgroundSize: `${period}px ${amplitude * 2}px`,
        opacity: opacity,
        pointerEvents: 'none',
      }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Rect } from '@embedpdf/models';

const props = withDefaults(
  defineProps<{
    /** Stroke/markup color */
    strokeColor?: string;
    opacity?: number;
    segmentRects: Rect[];
    rect?: Rect;
    scale: number;
    onClick?: (e: PointerEvent | TouchEvent) => void;
  }>(),
  {
    opacity: 0.5,
  },
);

const resolvedColor = computed(() => props.strokeColor ?? '#FFFF00');
const amplitude = computed(() => 2 * props.scale);
const period = computed(() => 6 * props.scale);

const svgDataUri = computed(() => {
  const amp = amplitude.value;
  const per = period.value;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${per}" height="${
    amp * 2
  }" viewBox="0 0 ${per} ${amp * 2}">
    <path d="M0 ${amp} Q ${per / 4} 0 ${per / 2} ${amp} T ${per} ${amp}"
          fill="none" stroke="${resolvedColor.value}" stroke-width="${amp}" stroke-linecap="round"/>
  </svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
});
</script>
