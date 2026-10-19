<script setup lang="ts">
// The publish check's app (`tooling/build/src/check-framework-package.mjs`):
// the documented setup, type-checked against the packed package as a user installs it.
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { localEngine } from '@embedpdf/engine';
import Toolbar from './Toolbar.vue';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  searchPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p>Loading…</p></template>
      <Toolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SearchLayer />
          <AnnotationLayer />
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
