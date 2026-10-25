<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { localEngine } from '@embedpdf/engine';
import TabTools from './TabTools.vue';
import Tabs from './Tabs.vue';

import '../tabs.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin()];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-welcome.pdf');
  return { kind: 'bytes', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[
      { source: welcome, name: 'Contract' },
      { source: welcome, name: 'Report' },
    ]"
  >
    <Tabs :welcome="welcome" />
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <TabTools />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
