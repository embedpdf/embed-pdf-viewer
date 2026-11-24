<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import type { FieldControl } from '@embedpdf/vue/form';
import { localEngine } from '@embedpdf/engine';
import Switch from './Switch.vue';
import ViewButtons from './ViewButtons.vue';

import '../controls.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const forms = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/forms.pdf');
  return { kind: 'bytes', id: 'forms', bytes: new Uint8Array(await response.arrayBuffer()) };
};

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
