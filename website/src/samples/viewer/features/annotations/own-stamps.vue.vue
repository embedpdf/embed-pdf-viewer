<script setup lang="ts">
import { PDFViewer, type ViewerConfig } from '@embedpdf/viewer-vue';

const registration = 'https://www.embedpdf.com/pdfs/registration.pdf';

const config: ViewerConfig = {
  plugins: {
    stamp: {
      libraries: [{ id: 'marks', url: 'https://www.embedpdf.com/pdfs/marks.pdf' }],
      quick: ['marks:Check', 'marks:Cross'],
    },
  },
};
</script>

<template>
  <PDFViewer :src="registration" v-bind="config" style="height: 100%" />
</template>
