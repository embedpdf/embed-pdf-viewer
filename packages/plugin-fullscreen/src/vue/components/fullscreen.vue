<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useFullscreenPlugin, useFullscreenCapability } from '../hooks';
import { handleFullscreenRequest } from '../../shared/utils/fullscreen-utils';

const { provides: fullscreenCapabilityRef } = useFullscreenCapability();
const { plugin: fullscreenPluginRef } = useFullscreenPlugin();
const containerRef = ref<HTMLDivElement | null>(null);

let unsubscribe: (() => void) | null = null;
let fullscreenChangeUnsubscribe: (() => void) | null = null;

onMounted(() => {
  const fullscreenCapability = fullscreenCapabilityRef.value;
  const fullscreenPlugin = fullscreenPluginRef.value;

  if (fullscreenCapability && fullscreenPlugin) {
    unsubscribe = fullscreenCapability.onRequest(async (event) => {
      const targetSelector = fullscreenPlugin.getTargetSelector();
      await handleFullscreenRequest(event, containerRef.value, targetSelector);
    });
  }

  // Handle fullscreen state changes
  const plugin = fullscreenPluginRef.value;
  if (plugin) {
    const handler = () => {
      plugin.setFullscreenState(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);

    fullscreenChangeUnsubscribe = () => {
      document.removeEventListener('fullscreenchange', handler);
    };
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
  if (fullscreenChangeUnsubscribe) {
    fullscreenChangeUnsubscribe();
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
