<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@cloudpdf/viewer-vue';

const report = { grant: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };

const config: ViewerConfig = {
  readOnly: true,
  features: { 'documents.download': false, 'documents.print': false },
};
</script>

<template>
  <PDFViewer :src="report" v-bind="config" style="height: 100%" />
</template>
