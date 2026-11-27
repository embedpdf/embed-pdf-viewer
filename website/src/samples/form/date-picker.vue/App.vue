<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { localEngine } from '@embedpdf/engine';
import DatePicker from './DatePicker.vue';
import Refused from './Refused.vue';

import '../date-picker.css';

const engine = localEngine();
// No JavaScript here: the form plugin checks a typed date against the field's pattern itself.
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), formPlugin()];

const invoice = async (): Promise<OpenInput> => {
  const response = await fetch('https://www.embedpdf.com/pdfs/invoice.pdf');
  return { kind: 'bytes', id: 'invoice', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: invoice }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Refused />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer />
        </template>
        <template #overlay>
          <DatePicker />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
