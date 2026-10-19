<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';
import { config } from './viewer-config';
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' }" v-bind="config" style="height: 100vh" />
</template>
