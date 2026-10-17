<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { localEngine } from '@embedpdf/engine';
import WebsiteRules from './WebsiteRules.vue';

import '../rules.css';

const engine = localEngine();
// Websites open only on a click, as the page's example registers it.
const plugins = [
  actionsPlugin({
    policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <WebsiteRules />
    </DocumentGate>
  </Viewer>
</template>
