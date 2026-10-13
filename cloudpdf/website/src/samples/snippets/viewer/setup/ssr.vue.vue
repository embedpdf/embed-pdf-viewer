<!-- pages/report.vue in Nuxt: no <ClientOnly> needed. -->
<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" style="height: 100vh" />
</template>
