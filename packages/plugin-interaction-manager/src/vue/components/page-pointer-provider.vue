<script setup lang="ts">
import { ref, watchEffect, computed } from 'vue';
import { Position, restorePosition, Size, transformSize } from '@embedpdf/models';
import { createPointerProvider } from '../../shared/utils';
import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

interface Props {
  documentId: string;
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
const isPageExclusive = useIsPageExclusive(props.documentId);

const defaultConvertEventToPoint = computed(() => {
  return (event: PointerEvent, element: HTMLElement): Position => {
    const rect = element.getBoundingClientRect();
    const displayPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    const displaySize: Size = transformSize(
      { width: props.pageWidth, height: props.pageHeight },
      props.rotation,
      1,
    );

    return restorePosition(displaySize, displayPoint, props.rotation, props.scale);
  };
});

watchEffect((onCleanup) => {
  if (cap.value && divRef.value) {
    const cleanup = createPointerProvider(
      cap.value,
      { type: 'page', documentId: props.documentId, pageIndex: props.pageIndex },
      divRef.value,
      props.convertEventToPoint || defaultConvertEventToPoint.value,
    );
    onCleanup(cleanup);
  }
});
</script>

<template>
  <div
    ref="divRef"
    :style="{ position: 'relative', width: pageWidth + 'px', height: pageHeight + 'px' }"
  >
    <slot />
    <div
      v-if="isPageExclusive"
      :style="{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }"
    />
  </div>
</template>
