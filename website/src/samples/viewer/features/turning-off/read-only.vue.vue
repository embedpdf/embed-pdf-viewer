<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

const report = '/pdfs/report.pdf';

const config: ViewerConfig = {
  readOnly: true,
  disable: ['documents.download', 'documents.print'],
};
</script>

<template>
  <PDFViewer :src="report" v-bind="config" style="height: 100%" />
</template>
