<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { localEngine } from '@embedpdf/engine';
  import BrowserActions from './BrowserActions.svelte';

  import '../basic.css';

  const engine = localEngine();
  // The actions plugin runs a link that names a viewer command, such as the cover's "Next page".
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    actionsPlugin(),
    linkPlugin(),
  ];

  // [!doc-source links]
  const links = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/embedpdf-links.pdf');
    return { kind: 'bytes', id: 'links', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: links }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <BrowserActions />
    <p class="hint">
      Every blue label is a link. Click one, or press Tab to reach it and Enter to follow it.
    </p>
    <Stage class="stage">
      <RenderLayer />
      <LinkLayer />
    </Stage>
  </DocumentGate>
</Viewer>
