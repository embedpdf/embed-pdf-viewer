<script setup lang="ts">
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

const disable = ['forms'];
const onReady = (viewer: Viewer) => console.log('ready', viewer);
</script>

<template>
  <PDFViewer
    src="/report.pdf"
    theme="system"
    :disable="disable"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
