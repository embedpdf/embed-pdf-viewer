<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { ignore } from '@embedpdf/models';
import { Unsubscribe } from '@embedpdf/core';

import { useExportCapability, useExportPlugin } from '../hooks';

const { provides: exportCapabilityRef } = useExportCapability();
const { plugin: exportPluginRef } = useExportPlugin();
const anchorRef = ref<HTMLAnchorElement | null>(null);

let unsubscribe: Unsubscribe | null = null;

onMounted(() => {
  const exportCapability = exportCapabilityRef.value;
  const exportPlugin = exportPluginRef.value;

  if (!exportCapability || !exportPlugin) return;

  unsubscribe = exportPlugin.onRequest((event) => {
    const el = anchorRef.value;
    if (!el) return;

    const task = exportPlugin.saveAsCopyAndGetBufferAndName(event.documentId);
    task.wait(({ buffer, name }) => {
      const url = URL.createObjectURL(new Blob([buffer]));
      el.href = url;
      el.download = name;
      el.click();
      URL.revokeObjectURL(url);
    }, ignore);
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});
</script>

<template>
  <a ref="anchorRef" style="display: none" />
</template>
