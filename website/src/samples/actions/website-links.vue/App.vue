<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { localEngine } from '@embedpdf/engine';
import AskBeforeOpening from './AskBeforeOpening.vue';

import '../website-links.css';

const engine = localEngine();
const plugins = [actionsPlugin()];

const links = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-links.pdf');
  return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: links }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AskBeforeOpening />
    </DocumentGate>
  </Viewer>
</template>
