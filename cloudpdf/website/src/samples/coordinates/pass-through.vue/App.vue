<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { cloudEngine } from '@cloudpdf/engine';
import Hits from './Hits.vue';

import '../pass-through.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="layout">
        <Hits />
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <SearchLayer />
          </template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
