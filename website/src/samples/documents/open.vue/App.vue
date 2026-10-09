<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import Empty from './Empty.vue';
import Toolbar from './Toolbar.vue';

import '../open.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: ebook, name: 'ebook.pdf' }]"
  >
    <Toolbar :ebook="ebook" />
    <DocumentGate>
      <template #fallback><Empty /></template>
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
