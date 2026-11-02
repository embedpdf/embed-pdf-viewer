<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

// [!doc-source report]
const report = '/pdfs/report.pdf';
// [!/doc-source]

const config: ViewerConfig = {
  readOnly: true,
  disable: ['documents.download', 'documents.print'],
};
</script>

<template>
  <PDFViewer :src="report" v-bind="config" style="height: 100%" />
</template>
