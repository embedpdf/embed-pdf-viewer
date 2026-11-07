<script setup lang="ts">
import { PDFViewer, type Layout } from '@embedpdf/viewer-vue';

defineProps<{ toolbarBelow: boolean }>();

const toolbarAtBottom = (layout: Layout) => layout.place('main', 'bottom');
</script>

<template>
  <!-- A new key mounts a new viewer with the new config. -->
  <PDFViewer
    :key="toolbarBelow ? 'below' : 'above'"
    src="https://www.embedpdf.com/pdfs/welcome.pdf"
    :layout="toolbarBelow ? toolbarAtBottom : undefined"
    style="height: 100vh"
  />
</template>
