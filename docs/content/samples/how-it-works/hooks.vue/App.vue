<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { localEngine } from '@embedpdf/engine';
import SearchBox from './SearchBox.vue';

import '../hooks.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <SearchBox />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SearchLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
