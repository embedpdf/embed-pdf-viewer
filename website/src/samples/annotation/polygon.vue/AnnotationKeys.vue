<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useInteraction } from '@embedpdf/vue/interaction';
import { useAnnotation } from '@embedpdf/vue/annotation';

// Delete and Escape: the plugin leaves the keys to your app.
const annotation = useAnnotation();
const interaction = useInteraction();

function onKey(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement || annotation.text.getEditing()) return;
  if (event.key === 'Delete' || event.key === 'Backspace') void annotation.selection.delete();
  if (event.key === 'Escape') {
    annotation.cancel(); // a drag or a polygon in progress
    interaction.activateDefaultTool();
  }
}

onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<template></template>
