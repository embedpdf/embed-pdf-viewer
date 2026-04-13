<script setup lang="ts">
import { watchEffect } from 'vue';
import { useAnnotationPlugin, useAnnotationCapability } from '../hooks';

const { plugin } = useAnnotationPlugin();
const { provides } = useAnnotationCapability();

watchEffect((onCleanup) => {
  const p = provides.value;
  const pl = plugin.value;
  if (!p || !pl) return;

  const unsub = p.onNavigate((event) => {
    if (event.result.outcome === 'uri' && pl.config.autoOpenLinks !== false) {
      window.open(event.result.uri, '_blank', 'noopener,noreferrer');
    }
  });

  onCleanup(unsub);
});
</script>

<template>
  <span style="display: none" />
</template>
