<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import Toolbar from './Toolbar.vue';

import '../responsive.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });

// Facing pages with a roomy margin, and one rule for a narrow Stage: a thin
// margin and one page at a time. The rule has a name, so the UI can read it too.
const plugins = [
  stagePlugin({
    padding: 24,
    spread: 'odd',
    responsive: [
      { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4, spread: 'none' } },
    ],
  }),
  renderPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

const narrow = ref(false);
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <Toolbar v-model:narrow="narrow" />
      <div class="frame" :data-width="narrow ? 'narrow' : 'full'">
        <Stage class="stage">
          <template #page><RenderLayer /></template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
