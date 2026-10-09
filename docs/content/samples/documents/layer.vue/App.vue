<script setup lang="ts">
import { ref } from 'vue';
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { metadataPlugin } from '@embedpdf/vue/metadata';
import { localEngine } from '@embedpdf/engine';
import LayerBar from './LayerBar.vue';

import '../layer.css';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), metadataPlugin()];

// The original stays as it is: the document opens with a layer over it, and the changes go there.
const withLayer = async (layer?: Uint8Array): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return {
    kind: 'layerBytes',
    baseBytes: new Uint8Array(await response.arrayBuffer()),
    layer: layer ? { kind: 'artifact', bytes: layer } : { kind: 'fresh' },
  };
};

const reopened = ref(false);
</script>

<template>
  <Viewer
    :engine="engine"
    :plugins="plugins"
    :initial-documents="[{ source: () => withLayer(), name: 'ebook.pdf' }]"
  >
    <DocumentGate>
      <template #fallback><p class="loading">Opening…</p></template>
      <LayerBar :reopened="reopened" :with-layer="withLayer" @reopened="reopened = true" />
      <Stage class="stage">
        <template #page><RenderLayer /></template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
