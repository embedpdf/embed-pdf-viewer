<script lang="ts" module>
  import { DocumentGate, Viewer, type OpenInput } from '@embedpdf/svelte/runtime';
  import { Stage, stagePlugin } from '@embedpdf/svelte/stage';
  import { RenderLayer, renderPlugin } from '@embedpdf/svelte/render';
  import { interactionPlugin } from '@embedpdf/svelte/interaction';
  import { annotationPlugin } from '@embedpdf/svelte/annotation';
  import { LinkLayer, linkPlugin } from '@embedpdf/svelte/link';
  import { localEngine } from '@embedpdf/engine';
  import AddLinks from './AddLinks.svelte';

  import '../custom.css';

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

<script lang="ts">
  let shown = $state(true);
</script>

<Viewer {engine} {plugins} initialDocuments={[{ source: ebook }]}>
  <DocumentGate>
    {#snippet fallback()}
      <p class="loading">Loading…</p>
    {/snippet}
    <AddLinks />
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Link areas">
        <button type="button" aria-pressed={shown} onclick={() => (shown = true)}>
          Show link areas
        </button>
        <button type="button" aria-pressed={!shown} onclick={() => (shown = false)}>
          As the PDF has them
        </button>
      </div>
    </div>
    <Stage class="stage">
      <RenderLayer />
      <LinkLayer>
        {#snippet link({ link, native })}
          {#if shown}
            <!-- Wrapping `native` keeps what a click does. -->
            <span class="pdf-link" data-kind={link.target.kind}>{@render native()}</span>
          {:else}
            <!-- The layer's own, invisible area. -->
            {@render native()}
          {/if}
        {/snippet}
      </LinkLayer>
    </Stage>
  </DocumentGate>
</Viewer>
