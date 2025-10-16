<script setup lang="ts">
import { computed } from 'vue';
import type { Size } from '@embedpdf/models';
import { useRotate } from '../hooks';

interface Props {
  documentId: string;
  pageSize: Size;
}

const props = defineProps<Props>();

const { provides: rotateScope } = useRotate(props.documentId);

const transformMatrix = computed(() => {
  // If the scope is not yet available, return an identity matrix.
  if (!rotateScope?.value) {
    return 'matrix(1, 0, 0, 1, 0, 0)';
  }

  // Get the CSS transform matrix string from the scoped capability.
  return rotateScope.value.getMatrixAsString({
    w: props.pageSize.width,
    h: props.pageSize.height,
  });
});
</script>

<template>
  <div
    :style="{
      position: 'absolute',
      transformOrigin: '0 0',
      transform: transformMatrix,
    }"
  >
    <slot />
  </div>
</template>
