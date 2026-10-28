<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { actionsPlugin } from '@embedpdf/vue/actions';
import { cloudEngine } from '@cloudpdf/engine';
import AskBeforeOpening from './AskBeforeOpening.vue';

import '../website-links.css';

const engine = cloudEngine();
const plugins = [actionsPlugin()];

const links: OpenInput = { kind: 'share', shareToken: 'shr_xs-9Y5qwuYrJ2BKtWzuo_2xy' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: links }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AskBeforeOpening />
    </DocumentGate>
  </Viewer>
</template>
