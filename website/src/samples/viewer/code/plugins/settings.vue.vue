<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

const links = '/pdfs/links.pdf';

const config: ViewerConfig = {
  plugins: {
    stage: { spread: 'odd', zoom: { mode: 'fit-width' } },
    selection: { color: 'rgb(124 58 237 / 0.3)' },
  },
};
</script>

<template>
  <PDFViewer :src="links" v-bind="config" style="height: 100%" />
</template>
