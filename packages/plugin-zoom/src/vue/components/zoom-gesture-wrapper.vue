<template>
  <div
    ref="elementRef"
    :style="{
      display: 'inline-block',
      overflow: 'visible',
      boxSizing: 'border-box',
    }"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import { useZoomGesture } from '../hooks/use-zoom-gesture';

interface Props {
  documentId: string;
  /** Enable pinch-to-zoom gesture (default: true) */
  enablePinch?: boolean;
  /** Enable wheel zoom with ctrl/cmd key (default: true) */
  enableWheel?: boolean;
  /** Override wheel zoom step; 0.1 = 10% (default: 0.1) */
  zoomStep?: number;
}

const props = withDefaults(defineProps<Props>(), {
  enablePinch: true,
  enableWheel: true,
  zoomStep: 0.1,
});

const { elementRef } = useZoomGesture(() => props.documentId, {
  enablePinch: toRef(() => props.enablePinch),
  enableWheel: toRef(() => props.enableWheel),
  zoomStep: toRef(() => props.zoomStep),
});
</script>
