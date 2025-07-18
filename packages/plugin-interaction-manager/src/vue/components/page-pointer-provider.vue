<script setup lang="ts">
import { ref, watchEffect, computed, StyleValue } from 'vue';
import { Position, restorePosition } from '@embedpdf/models';
import { createPointerProvider } from '../../shared/utils';
import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

interface Props {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  rotation: number;
  scale: number;
  convertEventToPoint?: (event: PointerEvent, element: HTMLElement) => Position;
}

const props = defineProps<Props>();

const divRef = ref<HTMLDivElement | null>(null);
const { provides: cap } = useInteractionManagerCapability();
const isPageExclusive = useIsPageExclusive();

const defaultConvertEventToPoint = computed(() => {
  return (event: PointerEvent, element: HTMLElement): Position => {
    const rect = element.getBoundingClientRect();
    const displayPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    return restorePosition(
      { width: props.pageWidth, height: props.pageHeight },
      displayPoint,
      props.rotation,
      props.scale,
    );
  };
});

watchEffect((onCleanup) => {
  if (cap.value && divRef.value) {
    const cleanup = createPointerProvider(
      cap.value,
      { type: 'page', pageIndex: props.pageIndex },
      divRef.value,
      props.convertEventToPoint || defaultConvertEventToPoint.value,
    );
    onCleanup(cleanup);
  }
});
</script>

<template>
  <div ref="divRef">
    <slot />
    <div
      v-if="isPageExclusive"
      :style="{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }"
    />
  </div>
</template>
