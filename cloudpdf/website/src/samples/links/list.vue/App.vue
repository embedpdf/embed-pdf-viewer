<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { LinkLayer, linkPlugin } from '@embedpdf/vue/link';
import { cloudEngine } from '@cloudpdf/engine';
import LinkList from './LinkList.vue';

import '../list.css';

const engine = cloudEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), linkPlugin()];

const links: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: links }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <div class="layout">
        <LinkList />
        <Stage class="stage">
          <template #page>
            <RenderLayer />
            <LinkLayer />
          </template>
        </Stage>
      </div>
    </DocumentGate>
  </Viewer>
</template>
