<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { localEngine } from '@embedpdf/engine';
import BuildToolbar from './BuildToolbar.vue';

import '../create.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <BuildToolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
