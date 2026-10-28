<!-- pages/report.vue in Nuxt: no <ClientOnly> needed. -->
<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" style="height: 100vh" />
</template>
