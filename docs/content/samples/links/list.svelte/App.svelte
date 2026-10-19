<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { annotationPlugin } from '@embedpdf/svelte/annotation';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { localEngine } from '@embedpdf/engine';
  import AddLinks from './AddLinks.svelte';
  import LinkList from './LinkList.svelte';

  import '../list.css';

  const engine = localEngine();
  // The annotation plugin is only here to make the links below.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    linkPlugin(),
  ];

  // [!doc-source ebook]
  const ebook = async (): Promise<OpenInput> => {
    const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
    return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
  };
  // [!/doc-source]
</script>

<script lang="ts">
  // The list reads the links once they're made.
  let ready = $state(false);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AddLinks onAdded={() => (ready = true)} />
    <div class="layout">
      <LinkList {ready} />
      <Stage class="stage">
        <RenderLayer />
        <LinkLayer />
      </Stage>
    </div>
  </DocumentGate>
</Viewer>
