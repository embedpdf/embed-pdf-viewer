<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import type { AnnotationRenderer } from '@embedpdf/vue/annotation';
import { localEngine } from '@embedpdf/engine';
import BrandedTextBox from './BrandedTextBox.vue';
import FormatButtons from './FormatButtons.vue';
import SelectTextBox from './SelectTextBox.vue';

import '../branded-text-box.css';

const engine = localEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const notice = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/notice.pdf');
  return { kind: 'bytes', id: 'notice', bytes: new Uint8Array(await response.arrayBuffer()) };
};

const RENDERERS: AnnotationRenderer[] = [
  { for: (annotation) => annotation.subtype === 'free-text', component: BrandedTextBox },
];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: notice }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectTextBox />
      <FormatButtons />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer :renderers="RENDERERS" />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
