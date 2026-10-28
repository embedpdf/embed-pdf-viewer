<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SearchLayer, searchPlugin } from '@embedpdf/vue/search';
import { cloudEngine } from '@cloudpdf/engine';
import SearchBox from './SearchBox.vue';

import '../basic.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), searchPlugin()];

const welcome: OpenInput = { kind: 'share', shareToken: 'shr_gvpJcG1ULUMon19C0D1wODSY' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <SearchBox />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <SearchLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
