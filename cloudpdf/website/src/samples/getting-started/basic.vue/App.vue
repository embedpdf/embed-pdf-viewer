<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { cloudEngine } from '@cloudpdf/engine';

// The engine is created synchronously and costs nothing until first use, so
// a module-level `const engine = …` is safe, even with server-side rendering.
// Only opening a document does real work: the UI renders at once.
const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const plugins = [stagePlugin(), renderPlugin()];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <div style="height: 500px">
      <!-- Document UI is defined over a document: gate it on having one. -->
      <DocumentGate>
        <template #fallback><p>Loading…</p></template>
        <Stage style="height: 100%">
          <template #page><RenderLayer /></template>
        </Stage>
      </DocumentGate>
    </div>
  </Viewer>
</template>
