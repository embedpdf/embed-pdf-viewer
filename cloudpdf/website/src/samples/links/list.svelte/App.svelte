<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { annotationPlugin } from '@embedpdf/svelte/annotation';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { cloudEngine } from '@cloudpdf/engine';
  import AddLinks from './AddLinks.svelte';
  import LinkList from './LinkList.svelte';

  import '../list.css';

  const engine = cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' });
  // The annotation plugin is only here to make the links below.
  const plugins = [
    stagePlugin(),
    renderPlugin(),
    interactionPlugin(),
    annotationPlugin(),
    linkPlugin(),
  ];

  const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };
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
