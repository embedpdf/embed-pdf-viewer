<template>
  <div
    ref="elementRef"
    :style="{
      display: 'block',
      width: 'fit-content',
      overflow: 'visible',
      boxSizing: 'border-box',
      margin: '0px auto',
    }"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
import { usePinch } from '../hooks/use-pinch-zoom';

const { elementRef } = usePinch();
</script>
