<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { formPlugin } from '@embedpdf/svelte/form';
  import { stampPlugin } from '@embedpdf/svelte/stamp';
  import { signaturePlugin } from '@embedpdf/svelte/signature';
  import { localEngine } from '@embedpdf/engine';
  import FillBar from './FillBar.svelte';

  import '../fill.css';

  const engine = localEngine();
  // [!asset-engine]
  const assetEngine = engine; // a person's marks are stamps, kept as PDFs; they open here too
  // [!/asset-engine]
  // No key: a mark is only drawn in, nothing is sealed.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    formPlugin(),
    stampPlugin({ assetEngine }),
    signaturePlugin(),
  ];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <FillBar />
    <Stage class="stage">
      <RenderLayer />
    </Stage>
  </DocumentGate>
</Viewer>
