<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import SelectSquare from './SelectSquare.vue';
import StylePanel from './StylePanel.vue';

import '../style-panel.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), annotationPlugin()];

const layout: OpenInput = { kind: 'share', shareToken: 'shr_d2E_LaTuddJbZR00d1CvkqLM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: layout }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectSquare />
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <AnnotationLayer />
          </template>
        </Stage>
        <StylePanel />
      </div>
    </DocumentGate>
  </Viewer>
</template>
