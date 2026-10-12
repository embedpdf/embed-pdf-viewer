<script setup lang="ts">
import { PDFViewer, type Layout } from '@embedpdf/viewer-vue';

defineProps<{ simple: boolean }>();

const simpleLayout = (layout: Layout) => layout.remove(['tool:pan', 'menu:view'], { from: 'main' });
</script>

<template>
  <!-- A new key mounts a new viewer with the new config. -->
  <PDFViewer
    :key="simple ? 'simple' : 'full'"
    src="/report.pdf"
    :layout="simple ? simpleLayout : undefined"
    style="height: 100vh"
  />
</template>
