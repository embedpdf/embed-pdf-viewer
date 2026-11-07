<!-- pages/report.vue in Nuxt: no <ClientOnly> needed. -->
<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';
</script>

<template>
  <PDFViewer src="https://www.embedpdf.com/pdfs/welcome.pdf" style="height: 100vh" />
</template>
