<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import DownloadAnyway from './DownloadAnyway.vue';

import '../refused.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};

// Read and select, but no downloading.
const scope = ['doc.open', 'doc.render', 'doc.text.select'];
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :scope="scope"
    :initial-documents="[{ source: ebook }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <DownloadAnyway />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
