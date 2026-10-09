<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { cloudEngine } from '@cloudpdf/engine';
import ToolSwitch from './ToolSwitch.vue';

import '../switch.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The document opens with the hand tool.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin({ defaultTool: 'pan' }),
  selectionPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ToolSwitch />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
