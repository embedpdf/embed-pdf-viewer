<script setup lang="ts">
import { ref, onMounted, onUnmounted, CSSProperties } from 'vue';
import { useFullscreenPlugin, useFullscreenCapability } from '../hooks';

const { provides: fullscreenCapabilityRef } = useFullscreenCapability();
const { plugin: fullscreenPluginRef } = useFullscreenPlugin();
const containerRef = ref<HTMLDivElement | null>(null);

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  const fullscreenCapability = fullscreenCapabilityRef.value;

  if (fullscreenCapability) {
    unsubscribe = fullscreenCapability.onRequest(async (action) => {
      const el = containerRef.value;
      if (action === 'enter') {
        if (el && !document.fullscreenElement) {
          await el.requestFullscreen();
        }
      } else {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      }
    });
  }

  // Handle fullscreen state changes
  const plugin = fullscreenPluginRef.value;
  if (plugin) {
    const handler = () => {
      plugin.setFullscreenState(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);

    onUnmounted(() => {
      document.removeEventListener('fullscreenchange', handler);
    });
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<template>
  <div
    ref="containerRef"
    :style="{
      position: 'relative',
      width: '100%',
      height: '100%',
    }"
  >
    <slot />
  </div>
</template>
