<template>
  <div
    :class="
      twMerge(
        isMobile ? 'my-2 border-t border-gray-200' : 'my-1 border-t border-gray-200',
        responsiveClasses,
      )
    "
  />
</template>

<script setup lang="ts">
import { twMerge } from 'tailwind-merge';

/**
 * Renders a menu divider
 */

interface Props {
  isMobile: boolean;
  responsiveClasses: string;
}

defineProps<Props>();
</script>
