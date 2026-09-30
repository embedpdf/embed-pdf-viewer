<script setup lang="ts">
import { useDocuments } from '@embedpdf/vue/runtime';

const documents = useDocuments();

async function onPick(event: Event) {
  const file = (event.target as HTMLInputElement).files![0];
  await documents.open({ kind: 'bytes', bytes: await file.arrayBuffer() }, { name: file.name });
}
</script>

<template>
  <input type="file" accept="application/pdf" @change="onPick" />
</template>
