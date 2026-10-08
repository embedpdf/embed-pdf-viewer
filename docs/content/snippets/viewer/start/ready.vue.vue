<script setup lang="ts">
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

function onReady(viewer: Viewer) {
  viewer.documents.onOpened(() => viewer.get('search').search('total'));
}
</script>

<template>
  <PDFViewer src="/report.pdf" style="height: 100vh" @ready="onReady" />
</template>
