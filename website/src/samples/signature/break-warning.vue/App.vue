<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { formPlugin } from '@embedpdf/vue/form';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { createTestSigner, signaturePlugin } from '@embedpdf/vue/signature';
import { localEngine } from '@embedpdf/engine';
import WarningBar from './WarningBar.vue';

import '../break-warning.css';

const engine = localEngine();
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
const signer = createTestSigner({ commonName: 'Ada Lovelace' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin({
    key: () => signer,
    // Trust the demo key itself, so its signature checks out as 'valid'.
    trust: { anchors: async () => [(await signer).certificate] },
  }),
];

const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <WarningBar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
