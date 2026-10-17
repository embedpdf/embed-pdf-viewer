<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { AnnotationLayer, annotationPlugin } from '@embedpdf/svelte/annotation';
  import { formPlugin } from '@embedpdf/svelte/form';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { createTestSigner, signaturePlugin } from '@embedpdf/svelte/signature';
  import { localEngine } from '@embedpdf/engine';
  import WarningBar from './WarningBar.svelte';

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

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <WarningBar />
    <Stage class="stage">
      <RenderLayer />
      <AnnotationLayer />
    </Stage>
  </DocumentGate>
</Viewer>
