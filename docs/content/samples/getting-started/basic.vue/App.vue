<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { localEngine } from '@embedpdf/engine';
import type { DocumentHandle, OpenInput } from '@embedpdf/engine';
import PdfPage from './PdfPage.vue';

// The Vue adapter is in progress — this drives the framework-free engine
// directly: App owns the engine and the document, PdfPage renders one page.
const doc = shallowRef<DocumentHandle>();

// The engine is created synchronously and costs nothing until first use —
// only opening a document does real work.
const engine = localEngine();

onMounted(async () => {
  // [!doc-source ebook]
  // The local engine opens bytes — fetch the sample and hand them over.
  const ebook: OpenInput = await fetch('https://snippet.embedpdf.com/ebook.pdf')
    .then((response) => response.arrayBuffer())
    .then((buffer) => ({ kind: 'bytes', id: 'ebook', bytes: new Uint8Array(buffer) }));
  // [!/doc-source]
  doc.value = await engine.open(ebook);
});
</script>

<template>
  <PdfPage v-if="doc" :doc="doc" :page-number="1" />
  <p v-else>Opening document…</p>
</template>
