<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { annotationPlugin } from '@embedpdf/vue/annotation';
import { LinkLayer, linkPlugin } from '@embedpdf/vue/link';
import { cloudEngine } from '@cloudpdf/engine';
import AddLinks from './AddLinks.vue';

import '../basic.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
// The annotation plugin is only here to make the links below.
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  linkPlugin(),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <AddLinks />
      <p class="hint">
        Two links at the top of the first page. Click one, or press Tab to reach it and Enter to
        follow it.
      </p>
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <LinkLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
