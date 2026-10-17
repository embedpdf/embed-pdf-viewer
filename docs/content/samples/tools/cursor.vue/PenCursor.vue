<script setup lang="ts">
import { useToolCursor } from '@embedpdf/vue/interaction';
import { penIcon } from './dots';

// While this is mounted, the dot tool's crosshair is a pen in `color`.
const props = defineProps<{ color: string }>();

useToolCursor(() => ({
  toolId: 'dot',
  cursors: { crosshair: { svg: penIcon(props.color), hotspot: { x: 3, y: 21 } } },
}));
</script>

<template></template>
