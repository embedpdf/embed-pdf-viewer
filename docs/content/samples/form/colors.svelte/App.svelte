<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { FormLayer, formPlugin } from '@embedpdf/svelte/form';
  import { localEngine } from '@embedpdf/engine';
  import ColorToolbar from './ColorToolbar.svelte';

  import '../colors.css';

  const engine = localEngine();
  // The colors the viewer draws around fields; `null` follows the viewer's accent.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    formPlugin({ fields: { border: '#ea580c' } }),
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
    <ColorToolbar />
    <Stage class="stage">
      <RenderLayer />
      <FormLayer />
    </Stage>
  </DocumentGate>
</Viewer>
