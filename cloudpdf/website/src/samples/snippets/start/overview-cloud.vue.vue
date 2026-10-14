<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';
import { fetchDocumentToken } from './api';

const engine = cloudEngine({ baseUrl: 'https://pdf.example.com' });
const plugins = [stagePlugin(), renderPlugin()];
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: { kind: 'token', token: () => fetchDocumentToken('contract') } }]"
  >
    <DocumentGate>
      <template #fallback><p>Opening…</p></template>
      <Stage style="height: 600px">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
