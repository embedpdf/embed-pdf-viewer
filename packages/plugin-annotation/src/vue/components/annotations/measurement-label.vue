<template>
  <g :style="{ pointerEvents: 'none' }">
    <rect
      :x="center.x - boxW / 2"
      :y="center.y - boxH / 2"
      :width="boxW"
      :height="boxH"
      :rx="padY"
      :ry="padY"
      :fill="background"
      :opacity="0.92"
    />
    <text
      :x="center.x"
      :y="center.y"
      :fill="color"
      :font-size="fontSize"
      text-anchor="middle"
      dominant-baseline="central"
      :style="{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 600,
        userSelect: 'none',
      }"
    >
      {{ text }}
    </text>
  </g>
</template>

<script lang="ts">
export default { inheritAttrs: false };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { Position } from '@embedpdf/models';

const LABEL_FONT_PX = 12;
const PADDING_X_PX = 5;
const PADDING_Y_PX = 3;
const CHAR_WIDTH_RATIO = 0.6;

const props = withDefaults(
  defineProps<{
    text: string;
    center: Position;
    scale: number;
    color?: string;
    background?: string;
  }>(),
  {
    color: '#ffffff',
    background: '#2962FF',
  },
);

// Guard against a zero/invalid zoom factor producing Infinity dimensions.
const safeScale = computed(() =>
  props.scale > 0 && Number.isFinite(props.scale) ? props.scale : 1,
);
const fontSize = computed(() => LABEL_FONT_PX / safeScale.value);
const padX = computed(() => PADDING_X_PX / safeScale.value);
const padY = computed(() => PADDING_Y_PX / safeScale.value);
const boxW = computed(() => props.text.length * fontSize.value * CHAR_WIDTH_RATIO + padX.value * 2);
const boxH = computed(() => fontSize.value + padY.value * 2);
</script>
