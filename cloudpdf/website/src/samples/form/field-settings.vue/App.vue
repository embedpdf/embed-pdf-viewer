<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { cloudEngine } from '@cloudpdf/engine';
import FieldSettings from './FieldSettings.vue';

import '../field-settings.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
];

const forms: OpenInput = { kind: 'share', shareToken: 'shr_eBRW5E3MpolzD8G36Alp30EF' };
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
