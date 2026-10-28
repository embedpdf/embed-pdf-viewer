<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { formPlugin } from '@embedpdf/vue/form';
import { signaturePlugin } from '@embedpdf/vue/signature';
import { localEngine } from '@embedpdf/engine';
import WarningBar from './WarningBar.vue';

import '../break-warning.css';

const engine = localEngine();

// The certificate Lanternfield signed the agreement with, published next to it. Trusting it is what
// makes the signature read 'valid'; your app trusts its own certificates the same way.
const lanternfieldCertificate = async () => {
  const response = await fetch('/pdfs/agreement.cer');
  return new Uint8Array(await response.arrayBuffer());
};

const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  signaturePlugin({ trust: { anchors: async () => [await lanternfieldCertificate()] } }),
];

// [!doc-source agreement]
const agreement = async (): Promise<OpenInput> => {
  const response = await fetch('/pdfs/agreement.pdf');
  return { kind: 'bytes', id: 'agreement', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: agreement }]">
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
