<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { localEngine } from '@embedpdf/engine';
import ChangeLog from './ChangeLog.vue';
import TitleBar from './TitleBar.vue';

import '../unsaved.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: ebook, name: 'report.pdf' }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <TitleBar />
      <ChangeLog />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
