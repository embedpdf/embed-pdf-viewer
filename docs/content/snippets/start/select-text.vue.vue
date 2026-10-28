<script setup lang="ts">
import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/vue/runtime';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { SelectionLayer, selectionPlugin } from '@embedpdf/vue/selection';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { localEngine } from '@embedpdf/engine';

const engine = localEngine();
const plugins = [stagePlugin(), renderPlugin(), interactionPlugin(), selectionPlugin()];

// [!doc-source welcome]
const welcome = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/welcome.pdf');
  return { kind: 'bytes', id: 'welcome', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: welcome }]">
    <DocumentGate>
      <Stage style="height: 500px">
        <template #page>
          <RenderLayer />
          <SelectionLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
