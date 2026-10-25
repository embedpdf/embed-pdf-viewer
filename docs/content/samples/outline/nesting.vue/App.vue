<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { outlinePlugin } from '@embedpdf/vue/outline';
import { localEngine } from '@embedpdf/engine';
import OutlineEditor from './OutlineEditor.vue';

import '../nesting.css';

const engine = localEngine();
const plugins = [outlinePlugin()];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/embedpdf-welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <OutlineEditor />
    </DocumentGate>
  </Viewer>
</template>
