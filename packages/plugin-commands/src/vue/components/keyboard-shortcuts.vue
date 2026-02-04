<template>
  <!-- This component is only used to set up keyboard shortcuts when the plugin is initialized -->
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useCommandsCapability } from '../hooks';
import { createKeyDownHandler } from '../../shared/utils';

const { provides: commands } = useCommandsCapability();

let cleanup: (() => void) | null = null;

onMounted(() => {
  if (!commands.value) return;

  const handleKeyDown = createKeyDownHandler(commands.value);

  document.addEventListener('keydown', handleKeyDown);
  cleanup = () => document.removeEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  cleanup?.();
});
</script>
