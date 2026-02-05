<script setup lang="ts">
import { computed } from 'vue';
import { useDocumentState } from '@embedpdf/core/vue';
import { Rotation } from '@embedpdf/models';
import { useRotatePlugin } from '../hooks';

interface RotateProps {
  documentId: string;
  pageIndex: number;
  rotation?: Rotation;
  scale?: number;
}

const props = defineProps<RotateProps>();

const { plugin: rotatePlugin } = useRotatePlugin();
const documentState = useDocumentState(() => props.documentId);

const page = computed(() => documentState.value?.document?.pages?.[props.pageIndex]);
const width = computed(() => page.value?.size?.width ?? 0);
const height = computed(() => page.value?.size?.height ?? 0);

// If override is provided, use it directly (consistent with other layer components)
// Otherwise, combine page intrinsic rotation with document rotation
const pageRotation = computed(() => page.value?.rotation ?? 0);
const rotation = computed(() => {
  if (props.rotation !== undefined) return props.rotation;
  const docRotation = documentState.value?.rotation ?? 0;
  return (pageRotation.value + docRotation) % 4;
});

const scale = computed(() => {
  if (props.scale !== undefined) return props.scale;
  return documentState.value?.scale ?? 1;
});

const matrix = computed(() => {
  if (!rotatePlugin.value) return 'matrix(1, 0, 0, 1, 0, 0)';

  return rotatePlugin.value.getMatrixAsString({
    width: width.value * scale.value,
    height: height.value * scale.value,
    rotation: rotation.value,
  });
});
</script>

<template>
  <div
    v-if="page"
    :style="{
      position: 'absolute',
      transformOrigin: '0 0',
      transform: matrix,
    }"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>
