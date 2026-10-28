<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { cloudEngine } from '@cloudpdf/engine';
import ActivityLog from './ActivityLog.vue';
import Toolbar from './Toolbar.vue';

import '../events.css';

const engine = cloudEngine();
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin(),
  annotationPlugin(),
];

const report: OpenInput = { kind: 'share', shareToken: 'shr__TWhIGdJtaKlcnVgJdg--bcm' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :identity="{ userId: 'u_381', displayName: 'Dana Smith' }"
    :initial-documents="[{ source: report }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar />
      <div class="viewer">
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SelectionLayer />
            <AnnotationLayer />
          </template>
        </Stage>
        <ActivityLog />
      </div>
    </DocumentGate>
  </Viewer>
</template>
