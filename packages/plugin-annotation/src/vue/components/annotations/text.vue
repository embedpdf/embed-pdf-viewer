<template>
  <div
    :style="{
      position: 'absolute',
      inset: 0,
      zIndex: 2,
      pointerEvents: isSelected ? 'none' : 'auto',
      cursor: isSelected ? 'move' : 'pointer',
    }"
    @pointerdown="onClick"
  >
    <svg
      v-if="!appearanceActive"
      :style="{ position: 'absolute', inset: 0, pointerEvents: 'none' }"
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
    >
      <path
        d="M 0.5 15.5 L 0.5 0.5 L 19.5 0.5 L 19.5 15.5 L 8.5 15.5 L 6.5 19.5 L 4.5 15.5 Z"
        :fill="color"
        :opacity="opacity"
        :stroke="lineColor"
        stroke-width="1"
        stroke-linejoin="miter"
      />
      <line x1="2.5" y1="4.25" x2="17.5" y2="4.25" :stroke="lineColor" stroke-width="1" />
      <line x1="2.5" y1="8" x2="17.5" y2="8" :stroke="lineColor" stroke-width="1" />
      <line x1="2.5" y1="11.75" x2="17.5" y2="11.75" :stroke="lineColor" stroke-width="1" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getContrastStrokeColor } from '@embedpdf/models';

const props = withDefaults(
  defineProps<{
    isSelected: boolean;
    color?: string;
    opacity?: number;
    onClick?: (e: PointerEvent) => void;
    appearanceActive?: boolean;
  }>(),
  {
    color: '#facc15',
    opacity: 1,
    appearanceActive: false,
  },
);

const lineColor = computed(() => getContrastStrokeColor(props.color));
</script>
