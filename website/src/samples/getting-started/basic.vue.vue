<script setup lang="ts">
import { onMounted, ref } from 'vue';

// The Vue adapter is in progress — this drives the framework-free engine
// directly: boot in a worker, open a document, render page 1 to an image.
const src = ref<string>();
const status = ref('Booting engine…');

onMounted(async () => {
  const { createLocalEngineWithWorker } = await import('@embedpdf/engine');
  const { default: EngineWorker } = await import('@embedpdf/engine/worker-entry?worker');
  const engine = await createLocalEngineWithWorker({ worker: new EngineWorker() });

  status.value = 'Opening document…';
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const doc = await engine.open({ kind: 'bytes', id: 'ebook', bytes });

  const { pages } = await doc.pages.list();
  const image = await doc
    .page(pages[0].pageObjectNumber)
    .render.image({ viewport: { kind: 'scale', scale: 1.5 } });
  src.value = (await image.objectUrl()).url;
});
</script>

<template>
  <div>
    <img
      v-if="src"
      :src="src"
      alt="Page 1"
      style="max-width: 100%; border: 1px solid #e6eaf2; border-radius: 8px"
    />
    <p v-else>{{ status }}</p>
  </div>
</template>
