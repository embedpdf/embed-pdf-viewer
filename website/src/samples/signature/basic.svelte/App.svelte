<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { createTestSigner, signaturePlugin } from '@embedpdf/svelte/signature';
  import { localEngine } from '@embedpdf/engine';
  import SignBar from './SignBar.svelte';

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

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <SignBar />
    <Stage class="stage">
      <RenderLayer />
      <!-- An empty signature field is "sign here": a click makes it the target -->
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
