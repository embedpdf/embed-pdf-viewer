<script setup lang="ts">
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

const features = { forms: false };
const onReady = (viewer: Viewer) => console.log('ready', viewer);
</script>

<template>
  <PDFViewer
    src="https://www.embedpdf.com/pdfs/welcome.pdf"
    theme="system"
    :features="features"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
