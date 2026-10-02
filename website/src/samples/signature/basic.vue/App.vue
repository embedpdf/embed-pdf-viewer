<script setup lang="ts">
import { DocumentGate, Viewer } from '@embedpdf/vue/runtime';
import type { OpenInput } from '@embedpdf/vue/runtime';
import { Stage, stagePlugin } from '@embedpdf/vue/stage';
import { RenderLayer, renderPlugin } from '@embedpdf/vue/render';
import { interactionPlugin } from '@embedpdf/vue/interaction';
import { FormLayer, formPlugin } from '@embedpdf/vue/form';
import { stampPlugin } from '@embedpdf/vue/stamp';
import { createTestSigner, signaturePlugin } from '@embedpdf/vue/signature';
import { localEngine } from '@embedpdf/engine';
import SignBar from './SignBar.vue';

import '../basic.css';

const engine = localEngine();
const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
// A throwaway key for the demo. Bring your own with `webCryptoSigner`, a
// service with `remoteSigner`, or a person's own with `personalSigner`.
const signer = createTestSigner({ commonName: 'Ada Lovelace' });
const plugins = [
  stagePlugin(),
  renderPlugin(),
  interactionPlugin(),
  formPlugin(),
  stampPlugin({ assetEngine }),
  signaturePlugin({
    key: () => signer,
    // Trust the demo key itself, so its signatures check out as 'valid'.
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
      <SignBar />
      <Stage class="stage">
        <template #page>
          <RenderLayer />
          <!-- An empty signature field is "sign here": a click makes it the target -->
          <FormLayer />
        </template>
      </Stage>
    </DocumentGate>
  </Viewer>
</template>
