<script setup lang="ts">
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search({ text: 'total' }));
}
</script>

<template>
  <PDFViewer
    src="https://www.embedpdf.com/pdfs/welcome.pdf"
    style="height: 100vh"
    @ready="onReady"
  />
</template>
