<script setup lang="ts">
import { ref } from 'vue';
import { PDFViewer } from '@embedpdf/viewer-vue';

const file = ref<File | null>(null);
const pick = (event: Event) => (file.value = (event.target as HTMLInputElement).files?.[0] ?? null);
</script>

<template>
  <input type="file" accept="application/pdf" @change="pick" />
  <PDFViewer :src="file" style="height: 80vh" />
</template>
