<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { cloudEngine } from '@cloudpdf/engine';
import ScriptConsole from './ScriptConsole.vue';

import '../javascript.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// JavaScript on, and two fields scripts often ask for about the user.
const plugins = [
  actionsPlugin({
    javascript: { enabled: true, identity: { name: 'Dana Smith', corporation: 'Acme' } },
  }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ScriptConsole />
    </DocumentGate>
  </Viewer>
</template>
