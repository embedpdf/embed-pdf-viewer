<script setup lang="ts">
import { saveFile, useDocuments } from '@embedpdf/vue/runtime';

const documents = useDocuments();

async function download() {
  saveFile(await documents.download(), 'contract.pdf');
}
</script>

<template>
  <button @click="download">Download</button>
</template>
