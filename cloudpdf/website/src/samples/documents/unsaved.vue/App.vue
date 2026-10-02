<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { cloudEngine } from '@cloudpdf/engine';
import ChangeLog from './ChangeLog.vue';
import TitleBar from './TitleBar.vue';

import '../unsaved.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: ebook, name: 'report.pdf' }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <TitleBar />
      <ChangeLog />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
