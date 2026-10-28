<script setup lang="ts">
import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/vue/runtime';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { cloudEngine } from '@cloudpdf/engine';
import HighlightButton from './HighlightButton.vue';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <HighlightButton />
      <Stage style="height: 500px">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
