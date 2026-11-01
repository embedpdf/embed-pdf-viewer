<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { PDFViewer, type Viewer } from '@embedpdf/viewer-vue';

import './on-ready.css';

// [!doc-source article]
const article = '/pdfs/article.pdf';
// [!/doc-source]

const viewer = shallowRef<Viewer | null>(null);
const page = ref<number | null>(null);

function onReady(ready: Viewer) {
  viewer.value = ready;
  // The pages are the document's: follow the current one once it has opened.
  ready.documents.onOpened(() => {
    const stage = ready.get('stage');
    page.value = stage.getCurrentPageIndex() + 1;
    ready.watch(
      () => stage.getCurrentPageIndex(),
      (index) => (page.value = index + 1),
    );
  });
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
