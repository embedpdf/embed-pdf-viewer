<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { cloudEngine } from '@cloudpdf/engine';
import WebsiteRules from './WebsiteRules.vue';

import '../rules.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// Websites open only on a click, as the page's example registers it.
const plugins = [
  actionsPlugin({
    policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
  }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <WebsiteRules />
    </DocumentGate>
  </Viewer>
</template>
