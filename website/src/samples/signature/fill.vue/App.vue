<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { formPlugin } from '@embedpdf/vue/form';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { signaturePlugin } from '@embedpdf/vue/signature';
import { localEngine } from '@embedpdf/engine';
import FillBar from './FillBar.vue';

import '../fill.css';

const engine = localEngine();
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
// No key: a mark is only drawn in, nothing is sealed.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin(),
];

const agreement = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-agreement.pdf');
  return { kind: 'bytes', id: 'agreement', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: agreement }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <FillBar />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
