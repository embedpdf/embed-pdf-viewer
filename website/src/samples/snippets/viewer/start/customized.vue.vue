<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
import { config } from './viewer-config';
</script>

<template>
  <PDFViewer
    src="https://www.embedpdf.com/pdfs/welcome.pdf"
    v-bind="config"
    style="height: 100vh"
  />
</template>
