<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { searchPlugin } from '@embedpdf/vue/search';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { redactionPlugin } from '@embedpdf/vue/redaction';
import { cloudEngine } from '@cloudpdf/engine';
import MarkFromCode from './MarkFromCode.vue';

import '../from-code.css';

const engine = cloudEngine();
// Marking matches runs a search; marking the selected text needs a selection.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  searchPlugin(),
  annotationPlugin(),
  redactionPlugin(),
];

const welcome: OpenInput = { kind: 'grant', grant: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <MarkFromCode />
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
