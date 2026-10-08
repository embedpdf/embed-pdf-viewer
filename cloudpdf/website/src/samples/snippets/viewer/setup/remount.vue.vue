<script setup lang="ts">
import { PDFViewer } from '@embedpdf/viewer-vue';

defineProps<{ readOnly: boolean }>();
</script>

<template>
  <!-- A new key mounts a new viewer with the new config. -->
  <PDFViewer
    :key="readOnly ? 'read-only' : 'edit'"
    src="/report.pdf"
    :disable="readOnly ? ['annotations', 'forms'] : []"
    style="height: 100vh"
  />
</template>
