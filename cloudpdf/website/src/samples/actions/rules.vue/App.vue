<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { cloudEngine } from '@cloudpdf/engine';
import WebsiteRules from './WebsiteRules.vue';

import '../rules.css';

const engine = cloudEngine();
// Websites open only on a click, as the page's example registers it.
const plugins = [
  actionsPlugin({
    policy: { uri: { user: 'adapter', hover: 'block', lifecycle: 'block' } },
  }),
];

const links: OpenInput = { kind: 'grant', grant: 'shr_xs-9Y5qwuYrJ2BKtWzuo_2xy' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: links }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <WebsiteRules />
    </DocumentGate>
  </Viewer>
</template>
