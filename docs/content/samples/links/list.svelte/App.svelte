<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { actionsPlugin } from '@embedpdf/svelte/actions';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { localEngine } from '@embedpdf/engine';
  import BrowserActions from './BrowserActions.svelte';
  import LinkList from './LinkList.svelte';

  import '../list.css';

  const engine = localEngine();
  // The actions plugin runs a link that names a viewer command, such as the footer's Next.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    actionsPlugin(),
    linkPlugin(),
  ];

  // [!doc-source links]
  const links = async (): Promise<OpenInput> => {
    const response = await fetch('/pdfs/links.pdf');
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
    <div class="layout">
      <LinkList />
      <Stage class="stage">
        <RenderLayer />
        <LinkLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
