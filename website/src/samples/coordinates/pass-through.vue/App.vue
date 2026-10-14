<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { localEngine } from '@embedpdf/engine';
import Hits from './Hits.vue';

import '../pass-through.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="layout">
        <Hits />
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SearchLayer />
          </template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
