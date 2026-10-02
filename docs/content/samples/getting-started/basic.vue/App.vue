<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';

// The engine is created synchronously and costs nothing until first use, so
// a module-level `const engine = …` is safe, even with server-side rendering.
// Only opening a document does real work: the UI renders at once.
const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source ebook]
// The local engine opens bytes: fetch lazily, under the loading tab.
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <div style="height: 500px">
      <!-- Document UI is defined over a document: gate it on having one. -->
      <DocumentGate>
        <template #fallback><p>Loading…</p></template>
        <Stage style="height: 100%">
          <template #page><RenderLayer /></template>
        </Stage>
      </DocumentGate>
    </div>
  </Viewer>
</template>
