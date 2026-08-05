<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue';
import type { LocalEngine } from '@embedpdf/engine';
import PdfPage from './PdfPage.vue';

// The Vue adapter is in progress — this drives the framework-free engine
// directly: App owns the engine and the document, PdfPage renders one page.
type PdfDocument = Awaited<ReturnType<LocalEngine['open']>>;

const doc = shallowRef<PdfDocument>();
const status = ref('Booting engine…');

onMounted(async () => {
  // `localEngine()` IS the engine — no worker wiring needed; PDFium boots in
  // a worker on first use. The Vue adapter will own this for you.
  const { localEngine } = await import('@embedpdf/engine');
  const engine = localEngine();

  status.value = 'Opening document…';
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  const bytes = new Uint8Array(await response.arrayBuffer());
  doc.value = await engine.open({ kind: 'bytes', id: 'ebook', bytes });
});
</script>

<template>
  <PdfPage v-if="doc" :doc="doc" :page-number="1" />
  <p v-else>{{ status }}</p>
</template>
