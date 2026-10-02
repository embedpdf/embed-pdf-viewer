<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { SelectionHandles, SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { cloudEngine } from '@cloudpdf/engine';
import ColorPicker from './ColorPicker.vue';
import SelectTitle from './SelectTitle.vue';

import '../colors.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  selectionPlugin({ handles: { shadow: '0 1px 3px rgb(0 0 0 / 0.3)' } }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const fromCss = ref(false);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SelectTitle />
      <div class="toolbar">
        <ColorPicker />
        <label class="option">
          <input v-model="fromCss" type="checkbox" />
          Override with CSS
        </label>
      </div>
      <Stage :class="fromCss ? 'stage from-css' : 'stage'">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
        </template>
        <template #overlay>
          <SelectionHandles />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
