<script setup lang="ts">
import { PDFViewer } from '@cloudpdf/viewer-vue';

const token = 'fixture-token';
</script>

<template>
  <PDFViewer :src="{ token }" style="height: 100vh" />
</template>
