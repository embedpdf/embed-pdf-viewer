<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { localEngine } from '@embedpdf/engine';
import Libraries from './Libraries.vue';

import '../persist.css';

const engine = localEngine();
const assetEngine = engine; // stamp libraries are PDFs; they open here too
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  stampPlugin({ assetEngine }),
];

const review = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-review.pdf');
  return { kind: 'bytes', id: 'review', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: review }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Libraries />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
