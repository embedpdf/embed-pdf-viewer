<template>
  <!-- This component is only used to make the pan mode default when the plugin is initialized -->
</template>

<script setup lang="ts">
import { onMounted, watchEffect } from 'vue';
import { usePanCapability, usePanPlugin } from '../hooks/use-pan';

const { provides: pan } = usePanCapability();
const { plugin: panPlugin } = usePanPlugin();

onMounted(() => {
  watchEffect(() => {
    if (!pan.value || !panPlugin.value) return;

    const mode = panPlugin.value.config?.defaultMode ?? 'never';
    const SUPPORT_TOUCH =
      typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    if (mode === 'mobile' && SUPPORT_TOUCH) {
      pan.value.makePanDefault();
    }
  });
});
</script>
