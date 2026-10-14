<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { localEngine } from '@embedpdf/engine';
import PropertiesEditor from './PropertiesEditor.vue';

import '../edit.css';

const engine = localEngine();
const plugins = [metadataPlugin()];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <PropertiesEditor />
    </DocumentGate>
  </Viewer>
</template>
