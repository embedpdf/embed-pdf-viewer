<script setup lang="ts">
import { onMounted, shallowRef } from 'vue';
import { cloudEngine } from '@cloudpdf/engine';
import type { DocumentHandle, OpenInput } from '@cloudpdf/engine';
import PdfPage from './PdfPage.vue';

// The Vue adapter is in progress — this drives the framework-free engine
// directly: App owns the engine and the document, PdfPage renders one page.
const doc = shallowRef<DocumentHandle>();

// The engine is created synchronously and costs nothing until first use —
// only opening a document does real work.
const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

onMounted(async () => {
  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
  doc.value = await engine.open(ebook);
});
</script>

<template>
  <PdfPage v-if="doc" :doc="doc" :page-number="1" />
  <p v-else>Opening document…</p>
</template>
