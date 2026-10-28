<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';
import { config } from './viewer-config';
</script>

<template>
  <PDFViewer :src="{ shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' }" v-bind="config" style="height: 100vh" />
</template>
