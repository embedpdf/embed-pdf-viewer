<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

import './on-ready.css';

// [!doc-source article]
const article = 'https://www.embedpdf.com/pdfs/article.pdf';
// [!/doc-source]

const viewer = shallowRef<Viewer | null>(null);
const page = ref<number | null>(null);

function onReady(ready: Viewer) {
  viewer.value = ready;
  // The pages are the document's: `watch` waits for it to open, then follows the current page.
  ready.watch(
    () => ready.get('stage').getCurrentPageIndex(),
    (index) => (page.value = index + 1),
    { immediate: true },
  );
}
</script>

<template>
  <div class="app">
    <header class="bar">
      <span class="page">{{ page ? `Page ${page}` : 'Opening…' }}</span>
      <button
        type="button"
        class="button"
        :disabled="!viewer"
        @click="viewer?.commands.execute('document:print')"
      >
        Print
      </button>
    </header>
    <PDFViewer :src="article" class="viewer" @ready="onReady" />
  </div>
</template>
