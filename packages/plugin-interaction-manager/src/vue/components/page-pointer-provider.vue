<script setup lang="ts">
import { ref, watch, computed, toValue } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { Position, restorePosition, transformSize } from '@embedpdf/models';
import { createPointerProvider } from '../../shared/utils';
import { useInteractionManagerCapability, useIsPageExclusive } from '../hooks';

interface PagePointerProviderProps {
  documentId: string;
  pageIndex: number;
  rotation?: number;
  scale?: number;
  convertEventToPoint?: (event: PointerEvent, element: HTMLElement) => Position;
}

const props = defineProps<PagePointerProviderProps>();

const divRef = ref<HTMLDivElement | null>(null);
const { provides: cap } = useInteractionManagerCapability();
const isPageExclusive = useIsPageExclusive(() => props.documentId);
const documentState = useDocumentState(() => props.documentId);
// Get page dimensions and transformations from document state
// Calculate inline - this is cheap and memoization isn't necessary
const page = computed(() => documentState.value?.document?.pages?.[props.pageIndex]);
const naturalPageSize = computed(() => page.value?.size ?? { width: 0, height: 0 });
// If override is provided, use it directly (consistent with other layer components)
// Otherwise, combine page intrinsic rotation with document rotation
const pageRotation = computed(() => page.value?.rotation ?? 0);
const rotation = computed(() => {
  if (props.rotation !== undefined) return props.rotation;
  const docRotation = documentState.value?.rotation ?? 0;
  return (pageRotation.value + docRotation) % 4;
});
const scale = computed(() => props.scale ?? documentState.value?.scale ?? 1);
const displaySize = computed(() => transformSize(naturalPageSize.value, 0, scale.value));

// Simplified conversion function
const defaultConvertEventToPoint = computed(() => {
  return (event: PointerEvent, element: HTMLElement): Position => {
    const rect = element.getBoundingClientRect();
    const displayPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    // Get the rotated natural size (width/height may be swapped, but not scaled)
    const rotatedNaturalSize = transformSize(
      {
        width: displaySize.value.width,
        height: displaySize.value.height,
      },
      rotation.value,
      1,
    );

    return restorePosition(rotatedNaturalSize, displayPoint, rotation.value, scale.value);
  };
});

watch(
  [
    cap,
    () => toValue(props.documentId),
    () => props.pageIndex,
    () => props.convertEventToPoint,
    defaultConvertEventToPoint,
  ],
  ([capValue, docId, pageIdx, customConvert, defaultConvert], _, onCleanup) => {
    if (!capValue || !divRef.value) return;

    const cleanup = createPointerProvider(
      capValue,
      { type: 'page', documentId: docId, pageIndex: pageIdx },
      divRef.value,
      customConvert || defaultConvert,
    );

    onCleanup(cleanup);
  },
  { immediate: true },
);
</script>

<template>
  <div
    ref="divRef"
    :style="{
      position: 'relative',
      width: displaySize.width + 'px',
      height: displaySize.height + 'px',
    }"
    v-bind="$attrs"
  >
    <slot />
    <div
      v-if="isPageExclusive"
      :style="{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }"
    />
  </div>
</template>
