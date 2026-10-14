<script setup lang="ts">
import { useToolCursor } from '@embedpdf/vue/interaction';
import { useAnnotationDefaults } from '@embedpdf/vue/annotation';

// A pen, 24 × 24, in a color: its tip is the bottom-left corner.
const penIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
  `<path d="M3 21l1.5-5.5L16 4l4 4L8.5 19.5z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>` +
  `</svg>`;

// The pen cursor follows the pen's color: a getter, so it's read again when the color changes.
const defaults = useAnnotationDefaults('ink');
useToolCursor(() => ({
  toolId: 'ink',
  cursors: {
    crosshair: { svg: penIcon(defaults.value.color ?? '#000000'), hotspot: { x: 2, y: 22 } },
  },
}));
</script>

<template></template>
