<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { localEngine } from '@embedpdf/engine';
import CustomFields from './CustomFields.vue';

import '../custom-fields.css';

const engine = localEngine();
const plugins = [metadataPlugin()];

const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <CustomFields />
    </DocumentGate>
  </Viewer>
</template>
