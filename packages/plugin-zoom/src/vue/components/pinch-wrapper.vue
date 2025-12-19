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
import { usePinch } from '../hooks/use-pinch-zoom';

interface Props {
  documentId: string;
}

const props = defineProps<Props>();

const { elementRef } = usePinch(props.documentId);
</script>
