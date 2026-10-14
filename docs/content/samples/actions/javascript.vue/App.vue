<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { localEngine } from '@embedpdf/engine';
import ScriptConsole from './ScriptConsole.vue';

import '../javascript.css';

const engine = localEngine();
// JavaScript on, and two fields scripts often ask for about the user.
const plugins = [
  actionsPlugin({
    javascript: { enabled: true, identity: { name: 'Dana Smith', corporation: 'Acme' } },
  }),
];

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ScriptConsole />
    </DocumentGate>
  </Viewer>
</template>
