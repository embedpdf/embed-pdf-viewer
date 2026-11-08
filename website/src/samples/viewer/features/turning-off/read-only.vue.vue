<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

const report = 'https://www.embedpdf.com/pdfs/report.pdf';

const config: ViewerConfig = {
  readOnly: true,
  features: { 'documents.download': false, 'documents.print': false },
};
</script>

<template>
  <PDFViewer :src="report" v-bind="config" style="height: 100%" />
</template>
