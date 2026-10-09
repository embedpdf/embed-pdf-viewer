<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { AnnotationLayer, annotationPlugin } from '@embedpdf/vue/annotation';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { createTestSigner, signaturePlugin } from '@embedpdf/vue/signature';
import { cloudEngine } from '@cloudpdf/engine';
import { localEngine } from '@embedpdf/engine';
import ArmBar from './ArmBar.vue';

import '../click-to-sign.css';

const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
const assetEngine = localEngine();
const signer = createTestSigner({ commonName: 'Ada Lovelace' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  annotationPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin({ key: () => signer }),
];

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
</script>

<template>
  <Viewer :engine="engine" :plugins="plugins" :initial-documents="[{ source: ebook }]">
    <DocumentGate>
      <template #fallback><p class="loading">Loading…</p></template>
      <ArmBar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <AnnotationLayer />
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
