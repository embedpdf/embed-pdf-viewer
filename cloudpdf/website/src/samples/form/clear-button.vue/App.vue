<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import type { FieldControl } from '@embedpdf/vue/form';
import { cloudEngine } from '@cloudpdf/engine';
import TextBox from './TextBox.vue';
import Toolbar from './Toolbar.vue';

import '../clear-button.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

// The one-line text boxes get the button; the layer draws every other box.
const controls: FieldControl[] = [
  { for: (widget) => widget.control === 'text' && !widget.multiline, component: TextBox },
];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: forms }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer :controls="controls" />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
