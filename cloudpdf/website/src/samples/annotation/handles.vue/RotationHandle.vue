<script setup lang="ts">
import type { RotationHandleProps } from '@embedpdf/vue/annotation';

const { at, size, active } = defineProps<RotationHandleProps>();
</script>

<template>
  <div
    :class="['turn', { 'turn--active': active }]"
    :style="{
      left: `${at.x - size}px`,
      top: `${at.y - size}px`,
      width: `${size * 2}px`,
      height: `${size * 2}px`,
    }"
  >
    ↻
  </div>
</template>
