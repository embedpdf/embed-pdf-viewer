<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import type { FieldControl } from '@embedpdf/vue/form';
import { cloudEngine } from '@cloudpdf/engine';
import Switch from './Switch.vue';
import ViewButtons from './ViewButtons.vue';

import '../controls.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms: OpenInput = { kind: 'grant', grant: 'shr_eBRW5E3MpolzD8G36Alp30EF' };

// The first control that matches a box draws it; the layer draws every other box.
const controls: FieldControl[] = [
  { for: (widget) => widget.control === 'toggle' && widget.kind === 'checkbox', component: Switch },
];
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: forms }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ViewButtons />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer :controls="controls" />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
