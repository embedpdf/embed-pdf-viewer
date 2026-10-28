<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { localEngine } from '@embedpdf/engine';
import Marks from './Marks.vue';

import '../marks.css';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const approvals = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/approvals.pdf');
  return { kind: 'bytes', id: 'approvals', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: approvals }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Marks />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
