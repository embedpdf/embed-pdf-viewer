<script setup lang="ts">
import { saveFile, useDocuments } from '@embedpdf/vue/runtime';

const documents = useDocuments();

async function save() {
  saveFile(await documents.download(), 'reviewed.pdf');
}
</script>

<template>
  <button @click="save">Save</button>
</template>
