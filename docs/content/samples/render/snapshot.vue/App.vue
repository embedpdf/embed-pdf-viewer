<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, SnapshotLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { localEngine } from '@embedpdf/engine';
import SnapshotToolbar from './SnapshotToolbar.vue';

import '../snapshot.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin({ defaultTool: 'pan' })];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SnapshotToolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SnapshotLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
