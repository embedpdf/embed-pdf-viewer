<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { localEngine } from '@embedpdf/engine';
import InvoiceBar from './InvoiceBar.vue';

import '../scripts.css';

const engine = localEngine();
// The form's scripts run with JavaScript on in the actions plugin.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  actionsPlugin({ javascript: { enabled: true } }),
];

const invoice = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/invoice.pdf');
  return { kind: 'bytes', id: 'invoice', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: invoice }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <InvoiceBar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
