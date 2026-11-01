<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { localEngine } from '@embedpdf/engine';
import FieldSettings from './FieldSettings.vue';

import '../field-settings.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

// [!doc-source forms]
const forms = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: forms }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <AnnotationLayer />
            <FormLayer />
          </template>
        </Stage>
        <FieldSettings />
      </div>
    </DocumentGate>
  </Viewer>
</template>
