<script setup lang="ts">
import { useToolCursor } from '@embedpdf/vue/interaction';
import { penIcon } from './icons';

const props = defineProps<{ color: string }>();

useToolCursor(() => ({
  toolId: 'ink',
  cursors: { crosshair: { svg: penIcon(props.color), hotspot: { x: 2, y: 22 } } },
}));
</script>

<template>
  <slot />
</template>
