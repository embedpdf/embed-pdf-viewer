<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { annotationPlugin } from '@embedpdf/svelte/annotation';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { localEngine } from '@embedpdf/engine';
  import AddLinks from './AddLinks.svelte';

  import '../basic.css';

  const engine = localEngine();
  // The annotation plugin is only here to make the links below.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    linkPlugin(),
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
    <AddLinks />
    <p class="hint">
      Two links at the top of the first page. Click one, or press Tab to reach it and Enter to
      follow it.
    </p>
    <Stage class="stage">
      <RenderLayer />
      <LinkLayer />
    </Stage>
  </DocumentGate>
</Viewer>
