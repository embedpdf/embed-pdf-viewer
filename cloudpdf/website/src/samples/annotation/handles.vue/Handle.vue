<script setup lang="ts">
import type { HandleProps } from '@embedpdf/vue/annotation';

const { at, size, rotation, kind, active } = defineProps<HandleProps>();
</script>

<template>
  <div
    :class="['handle', `handle--${kind}`, { 'handle--active': active }]"
    :style="{
      left: `${at.x - size / 2}px`,
      top: `${at.y - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      rotate: `${rotation}deg`,
    }"
  />
</template>
